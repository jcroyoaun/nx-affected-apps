"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.releaseVersion = exports.releaseVersionCLIHandler = exports.validReleaseVersionPrefixes = exports.deriveNewSemverVersion = void 0;
const chalk = require("chalk");
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const nx_json_1 = require("../../config/nx-json");
const tree_1 = require("../../generators/tree");
const file_map_utils_1 = require("../../project-graph/file-map-utils");
const project_graph_1 = require("../../project-graph/project-graph");
const output_1 = require("../../utils/output");
const params_1 = require("../../utils/params");
const path_1 = require("../../utils/path");
const workspace_root_1 = require("../../utils/workspace-root");
const generate_1 = require("../generate/generate");
const generator_utils_1 = require("../generate/generator-utils");
const config_1 = require("./config/config");
const filter_release_groups_1 = require("./config/filter-release-groups");
const version_plans_1 = require("./config/version-plans");
const batch_projects_by_generator_config_1 = require("./utils/batch-projects-by-generator-config");
const git_1 = require("./utils/git");
const print_changes_1 = require("./utils/print-changes");
const resolve_nx_json_error_message_1 = require("./utils/resolve-nx-json-error-message");
const shared_1 = require("./utils/shared");
const LARGE_BUFFER = 1024 * 1000000;
// Reexport some utils for use in plugin release-version generator implementations
var semver_1 = require("./utils/semver");
Object.defineProperty(exports, "deriveNewSemverVersion", { enumerable: true, get: function () { return semver_1.deriveNewSemverVersion; } });
exports.validReleaseVersionPrefixes = ['auto', '', '~', '^', '='];
const releaseVersionCLIHandler = (args) => (0, params_1.handleErrors)(args.verbose, () => releaseVersion(args));
exports.releaseVersionCLIHandler = releaseVersionCLIHandler;
/**
 * NOTE: This function is also exported for programmatic usage and forms part of the public API
 * of Nx. We intentionally do not wrap the implementation with handleErrors because users need
 * to have control over their own error handling when using the API.
 */
async function releaseVersion(args) {
    const projectGraph = await (0, project_graph_1.createProjectGraphAsync)({ exitOnError: true });
    const { projects } = (0, project_graph_1.readProjectsConfigurationFromProjectGraph)(projectGraph);
    const nxJson = (0, nx_json_1.readNxJson)();
    if (args.verbose) {
        process.env.NX_VERBOSE_LOGGING = 'true';
    }
    // Apply default configuration to any optional user configuration
    const { error: configError, nxReleaseConfig } = await (0, config_1.createNxReleaseConfig)(projectGraph, await (0, file_map_utils_1.createProjectFileMapUsingProjectGraph)(projectGraph), nxJson.release);
    if (configError) {
        return await (0, config_1.handleNxReleaseConfigError)(configError);
    }
    // The nx release top level command will always override these three git args. This is how we can tell
    // if the top level release command was used or if the user is using the changelog subcommand.
    // If the user explicitly overrides these args, then it doesn't matter if the top level config is set,
    // as all of the git options would be overridden anyway.
    if ((args.gitCommit === undefined ||
        args.gitTag === undefined ||
        args.stageChanges === undefined) &&
        nxJson.release?.git) {
        const nxJsonMessage = await (0, resolve_nx_json_error_message_1.resolveNxJsonConfigErrorMessage)([
            'release',
            'git',
        ]);
        output_1.output.error({
            title: `The "release.git" property in nx.json may not be used with the "nx release version" subcommand or programmatic API. Instead, configure git options for subcommands directly with "release.version.git" and "release.changelog.git".`,
            bodyLines: [nxJsonMessage],
        });
        process.exit(1);
    }
    const { error: filterError, releaseGroups, releaseGroupToFilteredProjects, } = (0, filter_release_groups_1.filterReleaseGroups)(projectGraph, nxReleaseConfig, args.projects, args.groups);
    if (filterError) {
        output_1.output.error(filterError);
        process.exit(1);
    }
    const rawVersionPlans = await (0, version_plans_1.readRawVersionPlans)();
    (0, version_plans_1.setVersionPlansOnGroups)(rawVersionPlans, releaseGroups, Object.keys(projectGraph.nodes));
    if (args.deleteVersionPlans === undefined) {
        // default to not delete version plans after versioning as they may be needed for changelog generation
        args.deleteVersionPlans = false;
    }
    runPreVersionCommand(nxReleaseConfig.version.preVersionCommand, {
        dryRun: args.dryRun,
        verbose: args.verbose,
    });
    const tree = new tree_1.FsTree(workspace_root_1.workspaceRoot, args.verbose);
    const versionData = {};
    const commitMessage = args.gitCommitMessage || nxReleaseConfig.version.git.commitMessage;
    const generatorCallbacks = [];
    /**
     * additionalChangedFiles are files which need to be updated as a side-effect of versioning (such as package manager lock files),
     * and need to get staged and committed as part of the existing commit, if applicable.
     */
    const additionalChangedFiles = new Set();
    const additionalDeletedFiles = new Set();
    if (args.projects?.length) {
        /**
         * Run versioning for all remaining release groups and filtered projects within them
         */
        for (const releaseGroup of releaseGroups) {
            const releaseGroupName = releaseGroup.name;
            const releaseGroupProjectNames = Array.from(releaseGroupToFilteredProjects.get(releaseGroup));
            const projectBatches = (0, batch_projects_by_generator_config_1.batchProjectsByGeneratorConfig)(projectGraph, releaseGroup, 
            // Only batch based on the filtered projects within the release group
            releaseGroupProjectNames);
            for (const [generatorConfigString, projectNames,] of projectBatches.entries()) {
                const [generatorName, generatorOptions] = JSON.parse(generatorConfigString);
                // Resolve the generator for the batch and run versioning on the projects within the batch
                const generatorData = resolveGeneratorData({
                    ...extractGeneratorCollectionAndName(`batch "${JSON.stringify(projectNames)}" for release-group "${releaseGroupName}"`, generatorName),
                    configGeneratorOptions: generatorOptions,
                    // all project data from the project graph (not to be confused with projectNamesToRunVersionOn)
                    projects,
                });
                const generatorCallback = await runVersionOnProjects(projectGraph, nxJson, args, tree, generatorData, args.generatorOptionsOverrides, projectNames, releaseGroup, versionData, nxReleaseConfig.conventionalCommits);
                // Capture the callback so that we can run it after flushing the changes to disk
                generatorCallbacks.push(async () => {
                    const result = await generatorCallback(tree, {
                        dryRun: !!args.dryRun,
                        verbose: !!args.verbose,
                        generatorOptions: {
                            ...generatorOptions,
                            ...args.generatorOptionsOverrides,
                        },
                    });
                    const { changedFiles, deletedFiles } = parseGeneratorCallbackResult(result);
                    changedFiles.forEach((f) => additionalChangedFiles.add(f));
                    deletedFiles.forEach((f) => additionalDeletedFiles.add(f));
                });
            }
        }
        // Resolve any git tags as early as possible so that we can hard error in case of any duplicates before reaching the actual git command
        const gitTagValues = args.gitTag ?? nxReleaseConfig.version.git.tag
            ? (0, shared_1.createGitTagValues)(releaseGroups, releaseGroupToFilteredProjects, versionData)
            : [];
        (0, shared_1.handleDuplicateGitTags)(gitTagValues);
        printAndFlushChanges(tree, !!args.dryRun);
        for (const generatorCallback of generatorCallbacks) {
            await generatorCallback();
        }
        const changedFiles = [
            ...tree.listChanges().map((f) => f.path),
            ...additionalChangedFiles,
        ];
        // No further actions are necessary in this scenario (e.g. if conventional commits detected no changes)
        if (!changedFiles.length) {
            return {
                // An overall workspace version cannot be relevant when filtering to independent projects
                workspaceVersion: undefined,
                projectsVersionData: versionData,
            };
        }
        if (args.gitCommit ?? nxReleaseConfig.version.git.commit) {
            await (0, shared_1.commitChanges)({
                changedFiles,
                deletedFiles: Array.from(additionalDeletedFiles),
                isDryRun: !!args.dryRun,
                isVerbose: !!args.verbose,
                gitCommitMessages: (0, shared_1.createCommitMessageValues)(releaseGroups, releaseGroupToFilteredProjects, versionData, commitMessage),
                gitCommitArgs: args.gitCommitArgs || nxReleaseConfig.version.git.commitArgs,
            });
        }
        else if (args.stageChanges ?? nxReleaseConfig.version.git.stageChanges) {
            output_1.output.logSingleLine(`Staging changed files with git`);
            await (0, git_1.gitAdd)({
                changedFiles,
                dryRun: args.dryRun,
                verbose: args.verbose,
            });
        }
        if (args.gitTag ?? nxReleaseConfig.version.git.tag) {
            output_1.output.logSingleLine(`Tagging commit with git`);
            for (const tag of gitTagValues) {
                await (0, git_1.gitTag)({
                    tag,
                    message: args.gitTagMessage || nxReleaseConfig.version.git.tagMessage,
                    additionalArgs: args.gitTagArgs || nxReleaseConfig.version.git.tagArgs,
                    dryRun: args.dryRun,
                    verbose: args.verbose,
                });
            }
        }
        return {
            // An overall workspace version cannot be relevant when filtering to independent projects
            workspaceVersion: undefined,
            projectsVersionData: versionData,
        };
    }
    /**
     * Run versioning for all remaining release groups
     */
    for (const releaseGroup of releaseGroups) {
        const releaseGroupName = releaseGroup.name;
        const projectBatches = (0, batch_projects_by_generator_config_1.batchProjectsByGeneratorConfig)(projectGraph, releaseGroup, 
        // Batch based on all projects within the release group
        releaseGroup.projects);
        for (const [generatorConfigString, projectNames,] of projectBatches.entries()) {
            const [generatorName, generatorOptions] = JSON.parse(generatorConfigString);
            // Resolve the generator for the batch and run versioning on the projects within the batch
            const generatorData = resolveGeneratorData({
                ...extractGeneratorCollectionAndName(`batch "${JSON.stringify(projectNames)}" for release-group "${releaseGroupName}"`, generatorName),
                configGeneratorOptions: generatorOptions,
                // all project data from the project graph (not to be confused with projectNamesToRunVersionOn)
                projects,
            });
            const generatorCallback = await runVersionOnProjects(projectGraph, nxJson, args, tree, generatorData, args.generatorOptionsOverrides, projectNames, releaseGroup, versionData, nxReleaseConfig.conventionalCommits);
            // Capture the callback so that we can run it after flushing the changes to disk
            generatorCallbacks.push(async () => {
                const result = await generatorCallback(tree, {
                    dryRun: !!args.dryRun,
                    verbose: !!args.verbose,
                    generatorOptions: {
                        ...generatorOptions,
                        ...args.generatorOptionsOverrides,
                    },
                });
                const { changedFiles, deletedFiles } = parseGeneratorCallbackResult(result);
                changedFiles.forEach((f) => additionalChangedFiles.add(f));
                deletedFiles.forEach((f) => additionalDeletedFiles.add(f));
            });
        }
    }
    // Resolve any git tags as early as possible so that we can hard error in case of any duplicates before reaching the actual git command
    const gitTagValues = args.gitTag ?? nxReleaseConfig.version.git.tag
        ? (0, shared_1.createGitTagValues)(releaseGroups, releaseGroupToFilteredProjects, versionData)
        : [];
    (0, shared_1.handleDuplicateGitTags)(gitTagValues);
    printAndFlushChanges(tree, !!args.dryRun);
    for (const generatorCallback of generatorCallbacks) {
        await generatorCallback();
    }
    // Only applicable when there is a single release group with a fixed relationship
    let workspaceVersion = undefined;
    if (releaseGroups.length === 1) {
        const releaseGroup = releaseGroups[0];
        if (releaseGroup.projectsRelationship === 'fixed') {
            const releaseGroupProjectNames = Array.from(releaseGroupToFilteredProjects.get(releaseGroup));
            workspaceVersion = versionData[releaseGroupProjectNames[0]].newVersion; // all projects have the same version so we can just grab the first
        }
    }
    const changedFiles = [
        ...tree.listChanges().map((f) => f.path),
        ...additionalChangedFiles,
    ];
    // No further actions are necessary in this scenario (e.g. if conventional commits detected no changes)
    if (!changedFiles.length) {
        return {
            workspaceVersion,
            projectsVersionData: versionData,
        };
    }
    if (args.gitCommit ?? nxReleaseConfig.version.git.commit) {
        await (0, shared_1.commitChanges)({
            changedFiles,
            deletedFiles: Array.from(additionalDeletedFiles),
            isDryRun: !!args.dryRun,
            isVerbose: !!args.verbose,
            gitCommitMessages: (0, shared_1.createCommitMessageValues)(releaseGroups, releaseGroupToFilteredProjects, versionData, commitMessage),
            gitCommitArgs: args.gitCommitArgs || nxReleaseConfig.version.git.commitArgs,
        });
    }
    else if (args.stageChanges ?? nxReleaseConfig.version.git.stageChanges) {
        output_1.output.logSingleLine(`Staging changed files with git`);
        await (0, git_1.gitAdd)({
            changedFiles,
            dryRun: args.dryRun,
            verbose: args.verbose,
        });
    }
    if (args.gitTag ?? nxReleaseConfig.version.git.tag) {
        output_1.output.logSingleLine(`Tagging commit with git`);
        for (const tag of gitTagValues) {
            await (0, git_1.gitTag)({
                tag,
                message: args.gitTagMessage || nxReleaseConfig.version.git.tagMessage,
                additionalArgs: args.gitTagArgs || nxReleaseConfig.version.git.tagArgs,
                dryRun: args.dryRun,
                verbose: args.verbose,
            });
        }
    }
    return {
        workspaceVersion,
        projectsVersionData: versionData,
    };
}
exports.releaseVersion = releaseVersion;
function appendVersionData(existingVersionData, newVersionData) {
    // Mutate the existing version data
    for (const [key, value] of Object.entries(newVersionData)) {
        if (existingVersionData[key]) {
            throw new Error(`Version data key "${key}" already exists in version data. This is likely a bug, please report your use-case on https://github.com/nrwl/nx`);
        }
        existingVersionData[key] = value;
    }
    return existingVersionData;
}
async function runVersionOnProjects(projectGraph, nxJson, args, tree, generatorData, generatorOverrides, projectNames, releaseGroup, versionData, conventionalCommitsConfig) {
    const generatorOptions = {
        // Always ensure a string to avoid generator schema validation errors
        specifier: args.specifier ?? '',
        preid: args.preid ?? '',
        ...generatorData.configGeneratorOptions,
        ...(generatorOverrides ?? {}),
        // The following are not overridable by user config
        projects: projectNames.map((p) => projectGraph.nodes[p]),
        projectGraph,
        releaseGroup,
        firstRelease: args.firstRelease ?? false,
        conventionalCommitsConfig,
        deleteVersionPlans: args.deleteVersionPlans,
    };
    // Apply generator defaults from schema.json file etc
    const combinedOpts = await (0, params_1.combineOptionsForGenerator)(generatorOptions, generatorData.collectionName, generatorData.normalizedGeneratorName, (0, project_graph_1.readProjectsConfigurationFromProjectGraph)(projectGraph), nxJson, generatorData.schema, false, null, (0, node_path_1.relative)(process.cwd(), workspace_root_1.workspaceRoot), args.verbose);
    const releaseVersionGenerator = generatorData.implementationFactory();
    // We expect all version generator implementations to return a ReleaseVersionGeneratorResult object, rather than a GeneratorCallback
    const versionResult = (await releaseVersionGenerator(tree, combinedOpts));
    if (typeof versionResult === 'function') {
        throw new Error(`The version generator ${generatorData.collectionName}:${generatorData.normalizedGeneratorName} returned a function instead of an expected ReleaseVersionGeneratorResult`);
    }
    // Merge the extra version data into the existing
    appendVersionData(versionData, versionResult.data);
    return versionResult.callback;
}
function printAndFlushChanges(tree, isDryRun) {
    const changes = tree.listChanges();
    console.log('');
    // Print the changes
    changes.forEach((f) => {
        if (f.type === 'CREATE') {
            console.error(`${chalk.green('CREATE')} ${f.path}${isDryRun ? chalk.keyword('orange')(' [dry-run]') : ''}`);
            (0, print_changes_1.printDiff)('', f.content?.toString() || '');
        }
        else if (f.type === 'UPDATE') {
            console.error(`${chalk.white('UPDATE')} ${f.path}${isDryRun ? chalk.keyword('orange')(' [dry-run]') : ''}`);
            const currentContentsOnDisk = (0, node_fs_1.readFileSync)((0, path_1.joinPathFragments)(tree.root, f.path)).toString();
            (0, print_changes_1.printDiff)(currentContentsOnDisk, f.content?.toString() || '');
        }
        else if (f.type === 'DELETE' && !f.path.includes('.nx')) {
            throw new Error('Unexpected DELETE change, please report this as an issue');
        }
    });
    if (!isDryRun) {
        (0, tree_1.flushChanges)(workspace_root_1.workspaceRoot, changes);
    }
}
function extractGeneratorCollectionAndName(description, generatorString) {
    let collectionName;
    let generatorName;
    const parsedGeneratorString = (0, generate_1.parseGeneratorString)(generatorString);
    collectionName = parsedGeneratorString.collection;
    generatorName = parsedGeneratorString.generator;
    if (!collectionName || !generatorName) {
        throw new Error(`Invalid generator string: ${generatorString} used for ${description}. Must be in the format of [collectionName]:[generatorName]`);
    }
    return { collectionName, generatorName };
}
function resolveGeneratorData({ collectionName, generatorName, configGeneratorOptions, projects, }) {
    try {
        const { normalizedGeneratorName, schema, implementationFactory } = (0, generator_utils_1.getGeneratorInformation)(collectionName, generatorName, workspace_root_1.workspaceRoot, projects);
        return {
            collectionName,
            generatorName,
            configGeneratorOptions,
            normalizedGeneratorName,
            schema,
            implementationFactory,
        };
    }
    catch (err) {
        if (err.message.startsWith('Unable to resolve')) {
            // See if it is because the plugin is not installed
            try {
                require.resolve(collectionName);
                // is installed
                throw new Error(`Unable to resolve the generator called "${generatorName}" within the "${collectionName}" package`);
            }
            catch {
                /**
                 * Special messaging for the most common case (especially as the user is unlikely to explicitly have
                 * the @nx/js generator config in their nx.json so we need to be clear about what the problem is)
                 */
                if (collectionName === '@nx/js') {
                    throw new Error('The @nx/js plugin is required in order to version your JavaScript packages. Run "nx add @nx/js" to add it to your workspace.');
                }
                throw new Error(`Unable to resolve the package ${collectionName} in order to load the generator called ${generatorName}. Is the package installed?`);
            }
        }
        // Unexpected error, rethrow
        throw err;
    }
}
function runPreVersionCommand(preVersionCommand, { dryRun, verbose }) {
    if (!preVersionCommand) {
        return;
    }
    output_1.output.logSingleLine(`Executing pre-version command`);
    if (verbose) {
        console.log(`Executing the following pre-version command:`);
        console.log(preVersionCommand);
    }
    let env = {
        ...process.env,
    };
    if (dryRun) {
        env.NX_DRY_RUN = 'true';
    }
    const stdio = verbose ? 'inherit' : 'pipe';
    try {
        (0, node_child_process_1.execSync)(preVersionCommand, {
            encoding: 'utf-8',
            maxBuffer: LARGE_BUFFER,
            stdio,
            env,
        });
    }
    catch (e) {
        const title = verbose
            ? `The pre-version command failed. See the full output above.`
            : `The pre-version command failed. Retry with --verbose to see the full output of the pre-version command.`;
        output_1.output.error({
            title,
            bodyLines: [preVersionCommand, e],
        });
        process.exit(1);
    }
}
function parseGeneratorCallbackResult(result) {
    if (Array.isArray(result)) {
        return {
            changedFiles: result,
            deletedFiles: [],
        };
    }
    else {
        return result;
    }
}

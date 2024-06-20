"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readGraphFileFromGraphArg = exports.getProjectRoots = exports.parseFiles = exports.splitArgsIntoNxArgsAndOverrides = exports.createOverrides = void 0;
const yargsParser = require("yargs-parser");
const file_utils_1 = require("../project-graph/file-utils");
const output_1 = require("./output");
const child_process_1 = require("child_process");
const workspace_root_1 = require("./workspace-root");
function createOverrides(__overrides_unparsed__ = []) {
    let overrides = yargsParser(__overrides_unparsed__, {
        configuration: {
            'camel-case-expansion': false,
            'dot-notation': true,
        },
    }) || {};
    if (!overrides._ || overrides._.length === 0) {
        delete overrides._;
    }
    overrides.__overrides_unparsed__ = __overrides_unparsed__;
    return overrides;
}
exports.createOverrides = createOverrides;
function splitArgsIntoNxArgsAndOverrides(args, mode, options = { printWarnings: true }, nxJson) {
    // this is to lerna case when this function is invoked imperatively
    if (args['target'] && !args['targets']) {
        args['targets'] = [args['target']];
    }
    delete args['target'];
    delete args['t'];
    if (!args.__overrides_unparsed__ && args._) {
        // required for backwards compatibility
        args.__overrides_unparsed__ = args._;
        delete args._;
    }
    // This handles the way Lerna passes in overrides
    if (!args.__overrides_unparsed__ && args.__overrides__) {
        // required for backwards compatibility
        args.__overrides_unparsed__ = args.__overrides__;
        delete args._;
    }
    const nxArgs = args;
    let overrides = createOverrides(args.__overrides_unparsed__);
    delete nxArgs.$0;
    delete nxArgs.__overrides_unparsed__;
    if (mode === 'run-many') {
        const args = nxArgs;
        if (!args.projects) {
            args.projects = [];
        }
        else if (typeof args.projects === 'string') {
            args.projects = args.projects.split(',');
        }
    }
    if (nxArgs.prod) {
        delete nxArgs.prod;
        nxArgs.configuration = 'production';
    }
    if (mode === 'affected') {
        if (options.printWarnings && nxArgs.all) {
            output_1.output.warn({
                title: `Running affected:* commands with --all can result in very slow builds.`,
                bodyLines: [
                    `${output_1.output.bold('--all')} is not meant to be used for any sizable project or to be used in CI.`,
                    '',
                    `${output_1.output.dim('Learn more about checking only what is affected: https://nx.dev/nx/affected')}`,
                ],
            });
        }
        // Allow setting base and head via environment variables (lower priority then direct command arguments)
        if (!nxArgs.base && process.env.NX_BASE) {
            nxArgs.base = process.env.NX_BASE;
            if (options.printWarnings) {
                output_1.output.note({
                    title: `No explicit --base argument provided, but found environment variable NX_BASE so using its value as the affected base: ${output_1.output.bold(`${nxArgs.base}`)}`,
                });
            }
        }
        if (!nxArgs.head && process.env.NX_HEAD) {
            nxArgs.head = process.env.NX_HEAD;
            if (options.printWarnings) {
                output_1.output.note({
                    title: `No explicit --head argument provided, but found environment variable NX_HEAD so using its value as the affected head: ${output_1.output.bold(`${nxArgs.head}`)}`,
                });
            }
        }
        if (!nxArgs.base) {
            nxArgs.base =
                nxJson.defaultBase ?? nxJson.affected?.defaultBase ?? 'main';
            // No user-provided arguments to set the affected criteria, so inform the user of the defaults being used
            if (options.printWarnings &&
                !nxArgs.head &&
                !nxArgs.files &&
                !nxArgs.uncommitted &&
                !nxArgs.untracked &&
                !nxArgs.all) {
                output_1.output.note({
                    title: `Affected criteria defaulted to --base=${output_1.output.bold(`${nxArgs.base}`)} --head=${output_1.output.bold('HEAD')}`,
                });
            }
        }
        if (nxArgs.base) {
            nxArgs.base = getMergeBase(nxArgs.base, nxArgs.head);
        }
    }
    if (typeof args.exclude === 'string') {
        nxArgs.exclude = args.exclude.split(',');
    }
    if (!nxArgs.skipNxCache) {
        nxArgs.skipNxCache = process.env.NX_SKIP_NX_CACHE === 'true';
    }
    normalizeNxArgsRunner(nxArgs, nxJson, options);
    if (args['parallel'] === 'false' || args['parallel'] === false) {
        nxArgs['parallel'] = 1;
    }
    else if (args['parallel'] === 'true' ||
        args['parallel'] === true ||
        args['parallel'] === '' ||
        process.env.NX_PARALLEL // dont require passing --parallel if NX_PARALLEL is set
    ) {
        nxArgs['parallel'] = Number(nxArgs['maxParallel'] ||
            nxArgs['max-parallel'] ||
            process.env.NX_PARALLEL ||
            3);
    }
    else if (args['parallel'] !== undefined) {
        nxArgs['parallel'] = Number(args['parallel']);
    }
    return { nxArgs, overrides };
}
exports.splitArgsIntoNxArgsAndOverrides = splitArgsIntoNxArgsAndOverrides;
function normalizeNxArgsRunner(nxArgs, nxJson, options) {
    if (!nxArgs.runner) {
        // TODO: Remove NX_RUNNER environment variable support in Nx v17
        for (const envKey of ['NX_TASKS_RUNNER', 'NX_RUNNER']) {
            const runner = process.env[envKey];
            if (runner) {
                const runnerExists = nxJson.tasksRunnerOptions?.[runner];
                if (options.printWarnings) {
                    if (runnerExists) {
                        output_1.output.note({
                            title: `No explicit --runner argument provided, but found environment variable ${envKey} so using its value: ${output_1.output.bold(`${runner}`)}`,
                        });
                    }
                    else if (nxArgs.verbose ||
                        process.env.NX_VERBOSE_LOGGING === 'true') {
                        output_1.output.warn({
                            title: `Could not find ${output_1.output.bold(`${runner}`)} within \`nx.json\` tasksRunnerOptions.`,
                            bodyLines: [
                                `${output_1.output.bold(`${runner}`)} was set by ${envKey}`,
                                ``,
                                `To suppress this message, either:`,
                                `  - provide a valid task runner with --runner`,
                                `  - ensure NX_TASKS_RUNNER matches a task runner defined in nx.json`,
                            ],
                        });
                    }
                }
                if (runnerExists) {
                    // TODO: Remove in v17
                    if (envKey === 'NX_RUNNER' && options.printWarnings) {
                        output_1.output.warn({
                            title: 'NX_RUNNER is deprecated, please use NX_TASKS_RUNNER instead.',
                        });
                    }
                    nxArgs.runner = runner;
                }
                break;
            }
        }
    }
}
function parseFiles(options) {
    const { files, uncommitted, untracked, base, head } = options;
    if (files) {
        return {
            files,
        };
    }
    else if (uncommitted) {
        return {
            files: getUncommittedFiles(),
        };
    }
    else if (untracked) {
        return {
            files: getUntrackedFiles(),
        };
    }
    else if (base && head) {
        return {
            files: getFilesUsingBaseAndHead(base, head),
        };
    }
    else if (base) {
        return {
            files: Array.from(new Set([
                ...getFilesUsingBaseAndHead(base, 'HEAD'),
                ...getUncommittedFiles(),
                ...getUntrackedFiles(),
            ])),
        };
    }
}
exports.parseFiles = parseFiles;
function getUncommittedFiles() {
    return parseGitOutput(`git diff --name-only --no-renames --relative HEAD .`);
}
function getUntrackedFiles() {
    return parseGitOutput(`git ls-files --others --exclude-standard`);
}
function getMergeBase(base, head = 'HEAD') {
    try {
        return (0, child_process_1.execSync)(`git merge-base "${base}" "${head}"`, {
            maxBuffer: file_utils_1.TEN_MEGABYTES,
            cwd: workspace_root_1.workspaceRoot,
            stdio: 'pipe',
        })
            .toString()
            .trim();
    }
    catch {
        try {
            return (0, child_process_1.execSync)(`git merge-base --fork-point "${base}" "${head}"`, {
                maxBuffer: file_utils_1.TEN_MEGABYTES,
                cwd: workspace_root_1.workspaceRoot,
                stdio: 'pipe',
            })
                .toString()
                .trim();
        }
        catch {
            return base;
        }
    }
}
function getFilesUsingBaseAndHead(base, head) {
    return parseGitOutput(`git diff --name-only --no-renames --relative "${base}" "${head}"`);
}
function parseGitOutput(command) {
    return (0, child_process_1.execSync)(command, { maxBuffer: file_utils_1.TEN_MEGABYTES, cwd: workspace_root_1.workspaceRoot })
        .toString('utf-8')
        .split('\n')
        .map((a) => a.trim())
        .filter((a) => a.length > 0);
}
function getProjectRoots(projectNames, { nodes }) {
    return projectNames.map((name) => nodes[name].data.root);
}
exports.getProjectRoots = getProjectRoots;
function readGraphFileFromGraphArg({ graph }) {
    return typeof graph === 'string' && graph !== 'true' && graph !== ''
        ? graph
        : undefined;
}
exports.readGraphFileFromGraphArg = readGraphFileFromGraphArg;

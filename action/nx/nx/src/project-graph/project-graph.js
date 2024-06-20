"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProjectGraphAndSourceMapsAsync = exports.createProjectGraphAsync = exports.handleProjectGraphError = exports.buildProjectGraphAndSourceMapsWithoutDaemon = exports.readProjectsConfigurationFromProjectGraph = exports.readCachedProjectConfiguration = exports.readCachedProjectGraph = void 0;
const perf_hooks_1 = require("perf_hooks");
const nx_json_1 = require("../config/nx-json");
const client_1 = require("../daemon/client/client");
const tmp_dir_1 = require("../daemon/tmp-dir");
const fileutils_1 = require("../utils/fileutils");
const output_1 = require("../utils/output");
const strip_indents_1 = require("../utils/strip-indents");
const workspace_root_1 = require("../utils/workspace-root");
const build_project_graph_1 = require("./build-project-graph");
const error_types_1 = require("./error-types");
const nx_deps_cache_1 = require("./nx-deps-cache");
const internal_api_1 = require("./plugins/internal-api");
const retrieve_workspace_files_1 = require("./utils/retrieve-workspace-files");
/**
 * Synchronously reads the latest cached copy of the workspace's ProjectGraph.
 * @throws {Error} if there is no cached ProjectGraph to read from
 */
function readCachedProjectGraph() {
    const projectGraphCache = (0, nx_deps_cache_1.readProjectGraphCache)();
    if (!projectGraphCache) {
        const angularSpecificError = (0, fileutils_1.fileExists)(`${workspace_root_1.workspaceRoot}/angular.json`)
            ? (0, strip_indents_1.stripIndents) `
      Make sure invoke 'node ./decorate-angular-cli.js' in your postinstall script.
      The decorated CLI will compute the project graph.
      'ng --help' should say 'Smart Monorepos · Fast CI'.
      `
            : '';
        throw new Error((0, strip_indents_1.stripIndents) `
      [readCachedProjectGraph] ERROR: No cached ProjectGraph is available.

      If you are leveraging \`readCachedProjectGraph()\` directly then you will need to refactor your usage to first ensure that
      the ProjectGraph is created by calling \`await createProjectGraphAsync()\` somewhere before attempting to read the data.

      If you encounter this error as part of running standard \`nx\` commands then please open an issue on https://github.com/nrwl/nx

      ${angularSpecificError}
    `);
    }
    return projectGraphCache;
}
exports.readCachedProjectGraph = readCachedProjectGraph;
function readCachedProjectConfiguration(projectName) {
    const graph = readCachedProjectGraph();
    const node = graph.nodes[projectName];
    try {
        return node.data;
    }
    catch (e) {
        throw new Error(`Cannot find project: '${projectName}' in your workspace.`);
    }
}
exports.readCachedProjectConfiguration = readCachedProjectConfiguration;
/**
 * Get the {@link ProjectsConfigurations} from the {@link ProjectGraph}
 */
function readProjectsConfigurationFromProjectGraph(projectGraph) {
    return {
        projects: Object.fromEntries(Object.entries(projectGraph.nodes).map(([project, { data }]) => [
            project,
            data,
        ])),
        version: 2,
    };
}
exports.readProjectsConfigurationFromProjectGraph = readProjectsConfigurationFromProjectGraph;
async function buildProjectGraphAndSourceMapsWithoutDaemon() {
    global.NX_GRAPH_CREATION = true;
    const nxJson = (0, nx_json_1.readNxJson)();
    perf_hooks_1.performance.mark('retrieve-project-configurations:start');
    let configurationResult;
    let projectConfigurationsError;
    const [plugins, cleanup] = await (0, internal_api_1.loadNxPlugins)(nxJson.plugins);
    try {
        configurationResult = await (0, retrieve_workspace_files_1.retrieveProjectConfigurations)(plugins, workspace_root_1.workspaceRoot, nxJson);
    }
    catch (e) {
        if (e instanceof error_types_1.ProjectConfigurationsError) {
            projectConfigurationsError = e;
            configurationResult = e.partialProjectConfigurationsResult;
        }
        else {
            throw e;
        }
    }
    const { projects, externalNodes, sourceMaps, projectRootMap } = configurationResult;
    perf_hooks_1.performance.mark('retrieve-project-configurations:end');
    perf_hooks_1.performance.mark('retrieve-workspace-files:start');
    const { allWorkspaceFiles, fileMap, rustReferences } = await (0, retrieve_workspace_files_1.retrieveWorkspaceFiles)(workspace_root_1.workspaceRoot, projectRootMap);
    perf_hooks_1.performance.mark('retrieve-workspace-files:end');
    const cacheEnabled = process.env.NX_CACHE_PROJECT_GRAPH !== 'false';
    perf_hooks_1.performance.mark('build-project-graph-using-project-file-map:start');
    let projectGraphError;
    let projectGraphResult;
    try {
        projectGraphResult = await (0, build_project_graph_1.buildProjectGraphUsingProjectFileMap)(projects, externalNodes, fileMap, allWorkspaceFiles, rustReferences, cacheEnabled ? (0, nx_deps_cache_1.readFileMapCache)() : null, plugins, sourceMaps);
    }
    catch (e) {
        if ((0, error_types_1.isAggregateProjectGraphError)(e)) {
            projectGraphResult = {
                projectGraph: e.partialProjectGraph,
                projectFileMapCache: null,
            };
            projectGraphError = e;
        }
        else {
            throw e;
        }
    }
    finally {
        cleanup();
    }
    const { projectGraph, projectFileMapCache } = projectGraphResult;
    perf_hooks_1.performance.mark('build-project-graph-using-project-file-map:end');
    delete global.NX_GRAPH_CREATION;
    const errors = [
        ...(projectConfigurationsError?.errors ?? []),
        ...(projectGraphError?.errors ?? []),
    ];
    if (errors.length > 0) {
        throw new error_types_1.ProjectGraphError(errors, projectGraph, sourceMaps);
    }
    else {
        if (cacheEnabled) {
            (0, nx_deps_cache_1.writeCache)(projectFileMapCache, projectGraph);
        }
        return { projectGraph, sourceMaps };
    }
}
exports.buildProjectGraphAndSourceMapsWithoutDaemon = buildProjectGraphAndSourceMapsWithoutDaemon;
function handleProjectGraphError(opts, e) {
    if (opts.exitOnError) {
        const isVerbose = process.env.NX_VERBOSE_LOGGING === 'true';
        if (e instanceof error_types_1.ProjectGraphError) {
            let title = e.message;
            if (isVerbose) {
                title += ' See errors below.';
            }
            const bodyLines = isVerbose
                ? [e.stack]
                : ['Pass --verbose to see the stacktraces.'];
            output_1.output.error({
                title,
                bodyLines: bodyLines,
            });
        }
        else {
            const lines = e.message.split('\n');
            output_1.output.error({
                title: lines[0],
                bodyLines: lines.slice(1),
            });
            if (isVerbose) {
                console.error(e);
            }
        }
        process.exit(1);
    }
    else {
        throw e;
    }
}
exports.handleProjectGraphError = handleProjectGraphError;
/**
 * Computes and returns a ProjectGraph.
 *
 * Nx will compute the graph either in a daemon process or in the current process.
 *
 * Nx will compute it in the current process if:
 * * The process is running in CI (CI env variable is to true or other common variables used by CI providers are set).
 * * It is running in the docker container.
 * * The daemon process is disabled because of the previous error when starting the daemon.
 * * `NX_DAEMON` is set to `false`.
 * * `useDaemonProcess` is set to false in the options of the tasks runner inside `nx.json`
 *
 * `NX_DAEMON` env variable takes precedence:
 * * If it is set to true, the daemon will always be used.
 * * If it is set to false, the graph will always be computed in the current process.
 *
 * Tip: If you want to debug project graph creation, run your command with NX_DAEMON=false.
 *
 * Nx uses two layers of caching: the information about explicit dependencies stored on the disk and the information
 * stored in the daemon process. To reset both run: `nx reset`.
 */
async function createProjectGraphAsync(opts = {
    exitOnError: false,
    resetDaemonClient: false,
}) {
    const projectGraphAndSourceMaps = await createProjectGraphAndSourceMapsAsync(opts);
    return projectGraphAndSourceMaps.projectGraph;
}
exports.createProjectGraphAsync = createProjectGraphAsync;
async function createProjectGraphAndSourceMapsAsync(opts = {
    exitOnError: false,
    resetDaemonClient: false,
}) {
    perf_hooks_1.performance.mark('create-project-graph-async:start');
    if (!client_1.daemonClient.enabled()) {
        try {
            const res = await buildProjectGraphAndSourceMapsWithoutDaemon();
            perf_hooks_1.performance.measure('create-project-graph-async >> retrieve-project-configurations', 'retrieve-project-configurations:start', 'retrieve-project-configurations:end');
            perf_hooks_1.performance.measure('create-project-graph-async >> retrieve-workspace-files', 'retrieve-workspace-files:start', 'retrieve-workspace-files:end');
            perf_hooks_1.performance.measure('create-project-graph-async >> build-project-graph-using-project-file-map', 'build-project-graph-using-project-file-map:start', 'build-project-graph-using-project-file-map:end');
            perf_hooks_1.performance.mark('create-project-graph-async:end');
            perf_hooks_1.performance.measure('create-project-graph-async', 'create-project-graph-async:start', 'create-project-graph-async:end');
            return res;
        }
        catch (e) {
            handleProjectGraphError(opts, e);
        }
    }
    else {
        try {
            const projectGraphAndSourceMaps = await client_1.daemonClient.getProjectGraphAndSourceMaps();
            perf_hooks_1.performance.mark('create-project-graph-async:end');
            perf_hooks_1.performance.measure('create-project-graph-async', 'create-project-graph-async:start', 'create-project-graph-async:end');
            return projectGraphAndSourceMaps;
        }
        catch (e) {
            if (e.message.indexOf('inotify_add_watch') > -1) {
                // common errors with the daemon due to OS settings (cannot watch all the files available)
                output_1.output.note({
                    title: `Unable to start Nx Daemon due to the limited amount of inotify watches, continuing without the daemon.`,
                    bodyLines: [
                        'For more information read: https://askubuntu.com/questions/1088272/inotify-add-watch-failed-no-space-left-on-device',
                        'Nx Daemon is going to be disabled until you run "nx reset".',
                    ],
                });
                (0, tmp_dir_1.markDaemonAsDisabled)();
                return buildProjectGraphAndSourceMapsWithoutDaemon();
            }
            if (e.internalDaemonError) {
                const errorLogFile = (0, tmp_dir_1.writeDaemonLogs)(e.message);
                output_1.output.warn({
                    title: `Nx Daemon was not able to compute the project graph.`,
                    bodyLines: [
                        `Log file with the error: ${errorLogFile}`,
                        `Please file an issue at https://github.com/nrwl/nx`,
                        'Nx Daemon is going to be disabled until you run "nx reset".',
                    ],
                });
                (0, tmp_dir_1.markDaemonAsDisabled)();
                return buildProjectGraphAndSourceMapsWithoutDaemon();
            }
            handleProjectGraphError(opts, e);
        }
        finally {
            if (opts.resetDaemonClient) {
                client_1.daemonClient.reset();
            }
        }
    }
}
exports.createProjectGraphAndSourceMapsAsync = createProjectGraphAndSourceMapsAsync;

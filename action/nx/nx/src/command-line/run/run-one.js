"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runOne = void 0;
const run_command_1 = require("../../tasks-runner/run-command");
const command_line_utils_1 = require("../../utils/command-line-utils");
const connect_to_nx_cloud_1 = require("../connect/connect-to-nx-cloud");
const perf_hooks_1 = require("perf_hooks");
const project_graph_1 = require("../../project-graph/project-graph");
const workspace_root_1 = require("../../utils/workspace-root");
const split_target_1 = require("../../utils/split-target");
const output_1 = require("../../utils/output");
const configuration_1 = require("../../config/configuration");
const calculate_default_project_name_1 = require("../../config/calculate-default-project-name");
const workspace_configuration_check_1 = require("../../utils/workspace-configuration-check");
const graph_1 = require("../graph/graph");
async function runOne(cwd, args, extraTargetDependencies = {}, extraOptions = {
    excludeTaskDependencies: false,
    loadDotEnvFiles: process.env.NX_LOAD_DOT_ENV_FILES !== 'false',
}) {
    perf_hooks_1.performance.mark('code-loading:end');
    perf_hooks_1.performance.measure('code-loading', 'init-local', 'code-loading:end');
    (0, workspace_configuration_check_1.workspaceConfigurationCheck)();
    const nxJson = (0, configuration_1.readNxJson)();
    const projectGraph = await (0, project_graph_1.createProjectGraphAsync)();
    const opts = parseRunOneOptions(cwd, args, projectGraph, nxJson);
    const { nxArgs, overrides } = (0, command_line_utils_1.splitArgsIntoNxArgsAndOverrides)({
        ...opts.parsedArgs,
        configuration: opts.configuration,
        targets: [opts.target],
    }, 'run-one', { printWarnings: args.graph !== 'stdout' }, nxJson);
    if (nxArgs.verbose) {
        process.env.NX_VERBOSE_LOGGING = 'true';
    }
    if (nxArgs.help) {
        await (await Promise.resolve().then(() => require('./run'))).printTargetRunHelp(opts, workspace_root_1.workspaceRoot);
        process.exit(0);
    }
    await (0, connect_to_nx_cloud_1.connectToNxCloudIfExplicitlyAsked)(nxArgs);
    const { projects } = getProjects(projectGraph, opts.project);
    if (nxArgs.graph) {
        const projectNames = projects.map((t) => t.name);
        const file = (0, command_line_utils_1.readGraphFileFromGraphArg)(nxArgs);
        return await (0, graph_1.generateGraph)({
            watch: true,
            open: true,
            view: 'tasks',
            targets: nxArgs.targets,
            projects: projectNames,
            file,
        }, projectNames);
    }
    else {
        const status = await (0, run_command_1.runCommand)(projects, projectGraph, { nxJson }, nxArgs, overrides, opts.project, extraTargetDependencies, extraOptions);
        process.exit(status);
    }
}
exports.runOne = runOne;
function getProjects(projectGraph, project) {
    if (!projectGraph.nodes[project]) {
        output_1.output.error({
            title: `Cannot find project '${project}'`,
        });
        process.exit(1);
    }
    let projects = [projectGraph.nodes[project]];
    let projectsMap = {
        [project]: projectGraph.nodes[project],
    };
    return { projects, projectsMap };
}
const targetAliases = {
    b: 'build',
    e: 'e2e',
    l: 'lint',
    s: 'serve',
    t: 'test',
};
function parseRunOneOptions(cwd, parsedArgs, projectGraph, nxJson) {
    const defaultProjectName = (0, calculate_default_project_name_1.calculateDefaultProjectName)(cwd, workspace_root_1.workspaceRoot, (0, project_graph_1.readProjectsConfigurationFromProjectGraph)(projectGraph), nxJson);
    let project;
    let target;
    let configuration;
    if (parsedArgs['project:target:configuration']?.indexOf(':') > -1) {
        // run case
        [project, target, configuration] = (0, split_target_1.splitTarget)(parsedArgs['project:target:configuration'], projectGraph);
        // this is to account for "nx npmsript:dev"
        if (project && !target && defaultProjectName) {
            target = project;
            project = defaultProjectName;
        }
    }
    else {
        target = parsedArgs.target ?? parsedArgs['project:target:configuration'];
    }
    if (parsedArgs.project) {
        project = parsedArgs.project;
    }
    if (!project && defaultProjectName) {
        project = defaultProjectName;
    }
    if (!project || !target) {
        throw new Error(`Both project and target have to be specified`);
    }
    if (targetAliases[target]) {
        target = targetAliases[target];
    }
    if (parsedArgs.configuration) {
        configuration = parsedArgs.configuration;
    }
    else if (parsedArgs.prod) {
        configuration = 'production';
    }
    const res = { project, target, configuration, parsedArgs };
    delete parsedArgs['c'];
    delete parsedArgs['project:target:configuration'];
    delete parsedArgs['configuration'];
    delete parsedArgs['prod'];
    delete parsedArgs['project'];
    return res;
}

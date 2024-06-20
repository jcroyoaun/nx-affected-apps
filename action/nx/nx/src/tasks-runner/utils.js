"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unparse = exports.isCacheableTask = exports.shouldStreamOutput = exports.getSerializedArgsForTask = exports.getPrintableCommandArgsForTask = exports.getCliPath = exports.calculateReverseDeps = exports.removeIdsFromGraph = exports.removeTasksFromTaskGraph = exports.getCustomHasher = exports.getExecutorForTask = exports.getExecutorNameForTask = exports.getTargetConfigurationForTask = exports.interpolate = exports.getOutputsForTargetAndConfiguration = exports.transformLegacyOutputs = exports.validateOutputs = exports.getOutputs = exports.expandDependencyConfigSyntaxSugar = exports.getDependencyConfigs = void 0;
const output_1 = require("../utils/output");
const path_1 = require("path");
const posix_1 = require("path/posix");
const workspace_root_1 = require("../utils/workspace-root");
const path_2 = require("../utils/path");
const fileutils_1 = require("../utils/fileutils");
const serialize_overrides_into_command_line_1 = require("../utils/serialize-overrides-into-command-line");
const split_target_1 = require("../utils/split-target");
const executor_utils_1 = require("../command-line/run/executor-utils");
const project_graph_1 = require("../project-graph/project-graph");
function getDependencyConfigs({ project, target }, extraTargetDependencies, projectGraph) {
    const dependencyConfigs = (projectGraph.nodes[project].data?.targets[target]?.dependsOn ??
        // This is passed into `run-command` from programmatic invocations
        extraTargetDependencies[target] ??
        []).map((config) => typeof config === 'string'
        ? expandDependencyConfigSyntaxSugar(config, projectGraph)
        : config);
    for (const dependencyConfig of dependencyConfigs) {
        if (dependencyConfig.projects && dependencyConfig.dependencies) {
            output_1.output.error({
                title: `dependsOn is improperly configured for ${project}:${target}`,
                bodyLines: [
                    `dependsOn.projects and dependsOn.dependencies cannot be used together.`,
                ],
            });
            process.exit(1);
        }
    }
    return dependencyConfigs;
}
exports.getDependencyConfigs = getDependencyConfigs;
function expandDependencyConfigSyntaxSugar(dependencyConfigString, graph) {
    const [dependencies, targetString] = dependencyConfigString.startsWith('^')
        ? [true, dependencyConfigString.substring(1)]
        : [false, dependencyConfigString];
    // Support for `project:target` syntax doesn't make sense for
    // dependencies, so we only support `target` syntax for dependencies.
    if (dependencies) {
        return {
            target: targetString,
            dependencies: true,
        };
    }
    // Support for both `project:target` and `target:with:colons` syntax
    const [maybeProject, ...segments] = (0, split_target_1.splitByColons)(targetString);
    // if no additional segments are provided, then the string references
    // a target of the same project
    if (!segments.length) {
        return { target: maybeProject };
    }
    return {
        // Only the first segment could be a project. If it is, the rest is a target.
        // If its not, then the whole targetString was a target with colons in its name.
        target: maybeProject in graph.nodes ? segments.join(':') : targetString,
        // If the first segment is a project, then we have a specific project. Otherwise, we don't.
        projects: maybeProject in graph.nodes ? [maybeProject] : undefined,
    };
}
exports.expandDependencyConfigSyntaxSugar = expandDependencyConfigSyntaxSugar;
function getOutputs(p, target, overrides) {
    return getOutputsForTargetAndConfiguration(target, overrides, p[target.project]);
}
exports.getOutputs = getOutputs;
class InvalidOutputsError extends Error {
    constructor(outputs, invalidOutputs) {
        super(InvalidOutputsError.createMessage(invalidOutputs));
        this.outputs = outputs;
        this.invalidOutputs = invalidOutputs;
    }
    static createMessage(invalidOutputs) {
        const invalidOutputsList = '\n - ' + Array.from(invalidOutputs).join('\n - ');
        return `The following outputs are invalid:${invalidOutputsList}\nPlease run "nx repair" to repair your configuration`;
    }
}
function assertOutputsAreValidType(outputs) {
    if (!Array.isArray(outputs)) {
        throw new Error("The 'outputs' field must be an array");
    }
    const typesArray = [];
    let hasInvalidType = false;
    for (const output of outputs) {
        if (typeof output !== 'string') {
            hasInvalidType = true;
        }
        typesArray.push(typeof output);
    }
    if (hasInvalidType) {
        throw new Error(`The 'outputs' field must contain only strings, but received types: [${typesArray.join(', ')}]`);
    }
}
function validateOutputs(outputs) {
    assertOutputsAreValidType(outputs);
    const invalidOutputs = new Set();
    for (const output of outputs) {
        if (!/^!?{[\s\S]+}/.test(output)) {
            invalidOutputs.add(output);
        }
    }
    if (invalidOutputs.size > 0) {
        throw new InvalidOutputsError(outputs, invalidOutputs);
    }
}
exports.validateOutputs = validateOutputs;
function transformLegacyOutputs(projectRoot, error) {
    return error.outputs.map((output) => {
        if (!error.invalidOutputs.has(output)) {
            return output;
        }
        let [isNegated, outputPath] = output.startsWith('!')
            ? [true, output.substring(1)]
            : [false, output];
        const relativePath = (0, fileutils_1.isRelativePath)(outputPath)
            ? output
            : (0, path_1.relative)(projectRoot, outputPath);
        const isWithinProject = !relativePath.startsWith('..');
        return ((isNegated ? '!' : '') +
            (0, path_2.joinPathFragments)(isWithinProject ? '{projectRoot}' : '{workspaceRoot}', isWithinProject ? relativePath : outputPath));
    });
}
exports.transformLegacyOutputs = transformLegacyOutputs;
/**
 * Returns the list of outputs that will be cached.
 */
function getOutputsForTargetAndConfiguration(taskTargetOrTask, overridesOrNode, node) {
    const taskTarget = 'id' in taskTargetOrTask ? taskTargetOrTask.target : taskTargetOrTask;
    const overrides = 'id' in taskTargetOrTask ? taskTargetOrTask.overrides : overridesOrNode;
    node = 'id' in taskTargetOrTask ? overridesOrNode : node;
    const { target, configuration } = taskTarget;
    const targetConfiguration = node.data.targets[target];
    const options = {
        ...targetConfiguration.options,
        ...targetConfiguration?.configurations?.[configuration],
        ...overrides,
    };
    if (targetConfiguration?.outputs) {
        validateOutputs(targetConfiguration.outputs);
        return targetConfiguration.outputs
            .map((output) => {
            return interpolate(output, {
                projectRoot: node.data.root,
                projectName: node.name,
                project: { ...node.data, name: node.name }, // this is legacy
                options,
            });
        })
            .filter((output) => !!output && !output.match(/{(projectRoot|workspaceRoot|(options.*))}/));
    }
    // Keep backwards compatibility in case `outputs` doesn't exist
    if (options.outputPath) {
        return Array.isArray(options.outputPath)
            ? options.outputPath
            : [options.outputPath];
    }
    else if (target === 'build' || target === 'prepare') {
        return [
            `dist/${node.data.root}`,
            `${node.data.root}/dist`,
            `${node.data.root}/build`,
            `${node.data.root}/public`,
        ];
    }
    else {
        return [];
    }
}
exports.getOutputsForTargetAndConfiguration = getOutputsForTargetAndConfiguration;
/**
 * Matches portions of a string which need to be interpolated.
 * Matches anything within curly braces, excluding the braces.
 */
const replacementRegex = /{([\s\S]+?)}/g;
function interpolate(template, data) {
    // Path is absolute or doesn't need interpolation
    if (template.startsWith('/') || !replacementRegex.test(template)) {
        return template;
    }
    if (template.includes('{workspaceRoot}', 1)) {
        throw new Error(`Output '${template}' is invalid. {workspaceRoot} can only be used at the beginning of the expression.`);
    }
    if (data.projectRoot == '.' && template.includes('{projectRoot}', 1)) {
        throw new Error(`Output '${template}' is invalid. When {projectRoot} is '.', it can only be used at the beginning of the expression.`);
    }
    const parts = template.split('/').map((s) => _interpolate(s, data));
    return (0, posix_1.join)(...parts).replace('{workspaceRoot}/', '');
}
exports.interpolate = interpolate;
function _interpolate(template, data) {
    let res = template;
    if (data.projectRoot == '.') {
        res = res.replace('{projectRoot}', '');
    }
    return res.replace(replacementRegex, (match) => {
        let value = data;
        let path = match.slice(1, -1).trim().split('.');
        for (let idx = 0; idx < path.length; idx++) {
            if (!value[path[idx]]) {
                return match;
            }
            value = value[path[idx]];
        }
        return value;
    });
}
function getTargetConfigurationForTask(task, projectGraph) {
    const project = projectGraph.nodes[task.target.project].data;
    return project.targets[task.target.target];
}
exports.getTargetConfigurationForTask = getTargetConfigurationForTask;
function getExecutorNameForTask(task, projectGraph) {
    return getTargetConfigurationForTask(task, projectGraph)?.executor;
}
exports.getExecutorNameForTask = getExecutorNameForTask;
function getExecutorForTask(task, projectGraph) {
    const executor = getExecutorNameForTask(task, projectGraph);
    const [nodeModule, executorName] = executor.split(':');
    return (0, executor_utils_1.getExecutorInformation)(nodeModule, executorName, workspace_root_1.workspaceRoot, (0, project_graph_1.readProjectsConfigurationFromProjectGraph)(projectGraph).projects);
}
exports.getExecutorForTask = getExecutorForTask;
function getCustomHasher(task, projectGraph) {
    const factory = getExecutorForTask(task, projectGraph).hasherFactory;
    return factory ? factory() : null;
}
exports.getCustomHasher = getCustomHasher;
function removeTasksFromTaskGraph(graph, ids) {
    const newGraph = removeIdsFromGraph(graph, ids, graph.tasks);
    return {
        dependencies: newGraph.dependencies,
        roots: newGraph.roots,
        tasks: newGraph.mapWithIds,
    };
}
exports.removeTasksFromTaskGraph = removeTasksFromTaskGraph;
function removeIdsFromGraph(graph, ids, mapWithIds) {
    const filteredMapWithIds = {};
    const dependencies = {};
    const removedSet = new Set(ids);
    for (let id of Object.keys(mapWithIds)) {
        if (!removedSet.has(id)) {
            filteredMapWithIds[id] = mapWithIds[id];
            dependencies[id] = graph.dependencies[id].filter((depId) => !removedSet.has(depId));
        }
    }
    return {
        mapWithIds: filteredMapWithIds,
        dependencies: dependencies,
        roots: Object.keys(dependencies).filter((k) => dependencies[k].length === 0),
    };
}
exports.removeIdsFromGraph = removeIdsFromGraph;
function calculateReverseDeps(taskGraph) {
    const reverseTaskDeps = {};
    Object.keys(taskGraph.tasks).forEach((t) => {
        reverseTaskDeps[t] = [];
    });
    Object.keys(taskGraph.dependencies).forEach((taskId) => {
        taskGraph.dependencies[taskId].forEach((d) => {
            reverseTaskDeps[d].push(taskId);
        });
    });
    return reverseTaskDeps;
}
exports.calculateReverseDeps = calculateReverseDeps;
function getCliPath() {
    return require.resolve(`../../bin/run-executor.js`);
}
exports.getCliPath = getCliPath;
function getPrintableCommandArgsForTask(task) {
    const args = task.overrides['__overrides_unparsed__'];
    const target = task.target.target.includes(':')
        ? `"${task.target.target}"`
        : task.target.target;
    const config = task.target.configuration
        ? `:${task.target.configuration}`
        : '';
    return ['run', `${task.target.project}:${target}${config}`, ...args];
}
exports.getPrintableCommandArgsForTask = getPrintableCommandArgsForTask;
function getSerializedArgsForTask(task, isVerbose) {
    return [
        JSON.stringify({
            targetDescription: task.target,
            overrides: task.overrides,
            isVerbose: isVerbose,
        }),
    ];
}
exports.getSerializedArgsForTask = getSerializedArgsForTask;
function shouldStreamOutput(task, initiatingProject) {
    if (process.env.NX_STREAM_OUTPUT === 'true')
        return true;
    if (longRunningTask(task))
        return true;
    if (task.target.project === initiatingProject)
        return true;
    return false;
}
exports.shouldStreamOutput = shouldStreamOutput;
function isCacheableTask(task, options) {
    if (task.cache !== undefined && !longRunningTask(task)) {
        return task.cache;
    }
    const cacheable = options.cacheableOperations || options.cacheableTargets;
    return (cacheable &&
        cacheable.indexOf(task.target.target) > -1 &&
        !longRunningTask(task));
}
exports.isCacheableTask = isCacheableTask;
function longRunningTask(task) {
    const t = task.target.target;
    return ((!!task.overrides['watch'] && task.overrides['watch'] !== 'false') ||
        t.endsWith(':watch') ||
        t.endsWith('-watch') ||
        t === 'serve' ||
        t === 'dev' ||
        t === 'start');
}
// TODO: vsavkin remove when nx-cloud doesn't depend on it
function unparse(options) {
    return (0, serialize_overrides_into_command_line_1.serializeOverridesIntoCommandLine)(options);
}
exports.unparse = unparse;

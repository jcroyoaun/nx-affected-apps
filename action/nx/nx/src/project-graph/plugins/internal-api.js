"use strict";
// This file contains the bits and bobs of the internal API for loading and interacting with Nx plugins.
// For the public API, used by plugin authors, see `./public-api.ts`.
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultPlugins = exports.loadNxPlugins = exports.nxPluginCache = exports.LoadedNxPlugin = void 0;
const path_1 = require("path");
const workspace_root_1 = require("../../utils/workspace-root");
const angular_json_1 = require("../../adapter/angular-json");
const isolation_1 = require("./isolation");
const loader_1 = require("./loader");
const utils_1 = require("./utils");
const error_types_1 = require("../error-types");
class LoadedNxPlugin {
    constructor(plugin, pluginDefinition) {
        this.name = plugin.name;
        if (typeof pluginDefinition !== 'string') {
            this.options = pluginDefinition.options;
            this.include = pluginDefinition.include;
            this.exclude = pluginDefinition.exclude;
        }
        if (plugin.createNodes && !plugin.createNodesV2) {
            this.createNodes = [
                plugin.createNodes[0],
                (configFiles, context) => (0, utils_1.createNodesFromFiles)(plugin.createNodes[1], configFiles, this.options, context).then((results) => results.map((r) => [this.name, r[0], r[1]])),
            ];
        }
        if (plugin.createNodesV2) {
            this.createNodes = [
                plugin.createNodesV2[0],
                async (configFiles, context) => {
                    const result = await plugin.createNodesV2[1](configFiles, this.options, context);
                    return result.map((r) => [this.name, r[0], r[1]]);
                },
            ];
        }
        if (this.createNodes) {
            const inner = this.createNodes[1];
            this.createNodes[1] = async (...args) => {
                performance.mark(`${plugin.name}:createNodes - start`);
                try {
                    return await inner(...args);
                }
                catch (e) {
                    if ((0, error_types_1.isAggregateCreateNodesError)(e)) {
                        throw e;
                    }
                    // The underlying plugin errored out. We can't know any partial results.
                    throw new error_types_1.AggregateCreateNodesError([[null, e]], []);
                }
                finally {
                    performance.mark(`${plugin.name}:createNodes - end`);
                    performance.measure(`${plugin.name}:createNodes`, `${plugin.name}:createNodes - start`, `${plugin.name}:createNodes - end`);
                }
            };
        }
        if (plugin.createDependencies) {
            this.createDependencies = (context) => plugin.createDependencies(this.options, context);
        }
        if (plugin.createMetadata) {
            this.createMetadata = (graph, context) => plugin.createMetadata(graph, this.options, context);
        }
        this.processProjectGraph = plugin.processProjectGraph;
    }
}
exports.LoadedNxPlugin = LoadedNxPlugin;
// Short lived cache (cleared between cmd runs)
// holding resolved nx plugin objects.
// Allows loaded plugins to not be reloaded when
// referenced multiple times.
exports.nxPluginCache = new Map();
async function loadNxPlugins(plugins, root = workspace_root_1.workspaceRoot) {
    const result = [];
    const loadingMethod = process.env.NX_ISOLATE_PLUGINS === 'true'
        ? isolation_1.loadNxPluginInIsolation
        : loader_1.loadNxPlugin;
    plugins = await normalizePlugins(plugins, root);
    const cleanupFunctions = [];
    for (const plugin of plugins) {
        const [loadedPluginPromise, cleanup] = loadingMethod(plugin, root);
        result.push(loadedPluginPromise);
        cleanupFunctions.push(cleanup);
    }
    return [
        await Promise.all(result),
        () => {
            for (const fn of cleanupFunctions) {
                fn();
            }
            if (loader_1.unregisterPluginTSTranspiler) {
                (0, loader_1.unregisterPluginTSTranspiler)();
            }
        },
    ];
}
exports.loadNxPlugins = loadNxPlugins;
async function normalizePlugins(plugins, root) {
    plugins ??= [];
    return [
        // This plugin adds targets that we want to be able to overwrite
        // in any user-land plugin, so it has to be first :).
        (0, path_1.join)(__dirname, '../../plugins/project-json/build-nodes/package-json-next-to-project-json'),
        ...plugins,
        // Most of the nx core node plugins go on the end, s.t. it overwrites any other plugins
        ...(await getDefaultPlugins(root)),
    ];
}
async function getDefaultPlugins(root) {
    return [
        (0, path_1.join)(__dirname, '../../plugins/js'),
        (0, path_1.join)(__dirname, '../../plugins/target-defaults/target-defaults-plugin'),
        ...((0, angular_json_1.shouldMergeAngularProjects)(root, false)
            ? [(0, path_1.join)(__dirname, '../../adapter/angular-json')]
            : []),
        (0, path_1.join)(__dirname, '../../plugins/package-json-workspaces'),
        (0, path_1.join)(__dirname, '../../plugins/project-json/build-nodes/project-json'),
    ];
}
exports.getDefaultPlugins = getDefaultPlugins;

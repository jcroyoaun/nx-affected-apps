"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listInstalledPlugins = exports.getInstalledPluginsAndCapabilities = exports.findInstalledPlugins = void 0;
const chalk = require("chalk");
const output_1 = require("../output");
const plugin_capabilities_1 = require("./plugin-capabilities");
const shared_1 = require("./shared");
const fileutils_1 = require("../fileutils");
const package_json_1 = require("../package-json");
const workspace_root_1 = require("../workspace-root");
const path_1 = require("path");
const nx_json_1 = require("../../config/nx-json");
const installation_directory_1 = require("../installation-directory");
function findInstalledPlugins() {
    const packageJsonDeps = getDependenciesFromPackageJson();
    const nxJsonDeps = getDependenciesFromNxJson();
    const deps = packageJsonDeps.concat(nxJsonDeps);
    const result = [];
    for (const dep of deps) {
        const pluginPackageJson = getNxPluginPackageJsonOrNull(dep);
        if (pluginPackageJson) {
            result.push(pluginPackageJson);
        }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
}
exports.findInstalledPlugins = findInstalledPlugins;
function getNxPluginPackageJsonOrNull(pkg) {
    try {
        const { packageJson } = (0, package_json_1.readModulePackageJson)(pkg, (0, installation_directory_1.getNxRequirePaths)());
        return packageJson &&
            [
                'ng-update',
                'nx-migrations',
                'schematics',
                'generators',
                'builders',
                'executors',
            ].some((field) => field in packageJson)
            ? packageJson
            : null;
    }
    catch {
        return null;
    }
}
function getDependenciesFromPackageJson(packageJsonPath = 'package.json') {
    try {
        const { dependencies, devDependencies } = (0, fileutils_1.readJsonFile)((0, path_1.join)(workspace_root_1.workspaceRoot, packageJsonPath));
        return Object.keys({ ...dependencies, ...devDependencies });
    }
    catch { }
    return [];
}
function getDependenciesFromNxJson() {
    const { installation } = (0, nx_json_1.readNxJson)();
    if (!installation) {
        return [];
    }
    return ['nx', ...Object.keys(installation.plugins || {})];
}
async function getInstalledPluginsAndCapabilities(workspaceRoot, projects) {
    const plugins = findInstalledPlugins().map((p) => p.name);
    const result = new Map();
    for (const plugin of Array.from(plugins).sort()) {
        try {
            const capabilities = await (0, plugin_capabilities_1.getPluginCapabilities)(workspaceRoot, plugin, projects);
            if (capabilities &&
                (capabilities.executors ||
                    capabilities.generators ||
                    capabilities.projectGraphExtension ||
                    capabilities.projectInference)) {
                result.set(plugin, capabilities);
            }
        }
        catch { }
    }
    return result;
}
exports.getInstalledPluginsAndCapabilities = getInstalledPluginsAndCapabilities;
function listInstalledPlugins(installedPlugins) {
    const bodyLines = [];
    for (const [, p] of installedPlugins) {
        const capabilities = [];
        if ((0, shared_1.hasElements)(p.executors)) {
            capabilities.push('executors');
        }
        if ((0, shared_1.hasElements)(p.generators)) {
            capabilities.push('generators');
        }
        if (p.projectGraphExtension) {
            capabilities.push('graph-extensions');
        }
        if (p.projectInference) {
            capabilities.push('project-inference');
        }
        bodyLines.push(`${chalk.bold(p.name)} (${capabilities.join()})`);
    }
    output_1.output.log({
        title: `Installed plugins:`,
        bodyLines: bodyLines,
    });
}
exports.listInstalledPlugins = listInstalledPlugins;

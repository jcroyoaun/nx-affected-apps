"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readModulePackageJson = exports.readModulePackageJsonWithoutFallbacks = exports.readTargetsFromPackageJson = exports.getMetadataFromPackageJson = exports.buildTargetFromScript = exports.readNxMigrateConfig = exports.normalizePackageGroup = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
const project_configuration_utils_1 = require("../project-graph/utils/project-configuration-utils");
const fileutils_1 = require("./fileutils");
const installation_directory_1 = require("./installation-directory");
const package_manager_1 = require("./package-manager");
function normalizePackageGroup(packageGroup) {
    return Array.isArray(packageGroup)
        ? packageGroup.map((x) => typeof x === 'string' ? { package: x, version: '*' } : x)
        : Object.entries(packageGroup).map(([pkg, version]) => ({
            package: pkg,
            version,
        }));
}
exports.normalizePackageGroup = normalizePackageGroup;
function readNxMigrateConfig(json) {
    const parseNxMigrationsConfig = (fromJson) => {
        if (!fromJson) {
            return {};
        }
        if (typeof fromJson === 'string') {
            return { migrations: fromJson, packageGroup: [] };
        }
        return {
            ...(fromJson.migrations ? { migrations: fromJson.migrations } : {}),
            ...(fromJson.packageGroup
                ? { packageGroup: normalizePackageGroup(fromJson.packageGroup) }
                : {}),
        };
    };
    return {
        ...parseNxMigrationsConfig(json['ng-update']),
        ...parseNxMigrationsConfig(json['nx-migrations']),
        // In case there's a `migrations` field in `package.json`
        ...parseNxMigrationsConfig(json),
    };
}
exports.readNxMigrateConfig = readNxMigrateConfig;
function buildTargetFromScript(script, scripts = {}, packageManagerCommand) {
    return {
        executor: 'nx:run-script',
        options: {
            script,
        },
        metadata: {
            scriptContent: scripts[script],
            runCommand: packageManagerCommand.run(script),
        },
    };
}
exports.buildTargetFromScript = buildTargetFromScript;
let packageManagerCommand;
function getMetadataFromPackageJson(packageJson) {
    const { scripts, nx } = packageJson ?? {};
    const includedScripts = nx?.includedScripts || Object.keys(scripts ?? {});
    return {
        targetGroups: {
            'NPM Scripts': includedScripts,
        },
    };
}
exports.getMetadataFromPackageJson = getMetadataFromPackageJson;
function readTargetsFromPackageJson(packageJson) {
    const { scripts, nx, private: isPrivate } = packageJson ?? {};
    const res = {};
    const includedScripts = nx?.includedScripts || Object.keys(scripts ?? {});
    packageManagerCommand ??= (0, package_manager_1.getPackageManagerCommand)();
    for (const script of includedScripts) {
        res[script] = buildTargetFromScript(script, scripts, packageManagerCommand);
    }
    for (const targetName in nx?.targets) {
        res[targetName] = (0, project_configuration_utils_1.mergeTargetConfigurations)(nx?.targets[targetName], res[targetName]);
    }
    /**
     * Add implicit nx-release-publish target for all package.json files that are
     * not marked as `"private": true` to allow for lightweight configuration for
     * package based repos.
     */
    if (!isPrivate && !res['nx-release-publish']) {
        res['nx-release-publish'] = {
            dependsOn: ['^nx-release-publish'],
            executor: '@nx/js:release-publish',
            options: {},
        };
    }
    return res;
}
exports.readTargetsFromPackageJson = readTargetsFromPackageJson;
/**
 * Uses `require.resolve` to read the package.json for a module.
 *
 * This will fail if the module doesn't export package.json
 *
 * @returns package json contents and path
 */
function readModulePackageJsonWithoutFallbacks(moduleSpecifier, requirePaths = (0, installation_directory_1.getNxRequirePaths)()) {
    const packageJsonPath = require.resolve(`${moduleSpecifier}/package.json`, {
        paths: requirePaths,
    });
    const packageJson = (0, fileutils_1.readJsonFile)(packageJsonPath);
    return {
        path: packageJsonPath,
        packageJson,
    };
}
exports.readModulePackageJsonWithoutFallbacks = readModulePackageJsonWithoutFallbacks;
/**
 * Reads the package.json file for a specified module.
 *
 * Includes a fallback that accounts for modules that don't export package.json
 *
 * @param {string} moduleSpecifier The module to look up
 * @param {string[]} requirePaths List of paths look in. Pass `module.paths` to ensure non-hoisted dependencies are found.
 *
 * @example
 * // Use the caller's lookup paths for non-hoisted dependencies
 * readModulePackageJson('http-server', module.paths);
 *
 * @returns package json contents and path
 */
function readModulePackageJson(moduleSpecifier, requirePaths = (0, installation_directory_1.getNxRequirePaths)()) {
    let packageJsonPath;
    let packageJson;
    try {
        ({ path: packageJsonPath, packageJson } =
            readModulePackageJsonWithoutFallbacks(moduleSpecifier, requirePaths));
    }
    catch {
        const entryPoint = require.resolve(moduleSpecifier, {
            paths: requirePaths,
        });
        let moduleRootPath = (0, path_1.dirname)(entryPoint);
        packageJsonPath = (0, path_1.join)(moduleRootPath, 'package.json');
        while (!(0, fs_1.existsSync)(packageJsonPath)) {
            moduleRootPath = (0, path_1.dirname)(moduleRootPath);
            packageJsonPath = (0, path_1.join)(moduleRootPath, 'package.json');
        }
        packageJson = (0, fileutils_1.readJsonFile)(packageJsonPath);
        if (packageJson.name && packageJson.name !== moduleSpecifier) {
            throw new Error(`Found module ${packageJson.name} while trying to locate ${moduleSpecifier}/package.json`);
        }
    }
    return {
        packageJson,
        path: packageJsonPath,
    };
}
exports.readModulePackageJson = readModulePackageJson;

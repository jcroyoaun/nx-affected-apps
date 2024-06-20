"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTsNodeCompilerOptions = exports.registerTsConfigPaths = exports.registerTranspiler = exports.getTranspiler = exports.getTsNodeTranspiler = exports.getSwcTranspiler = exports.registerTsProject = void 0;
const path_1 = require("path");
const logger_1 = require("../../../utils/logger");
const swcNodeInstalled = packageIsInstalled('@swc-node/register');
const tsNodeInstalled = packageIsInstalled('ts-node/register');
let ts;
let isTsEsmLoaderRegistered = false;
function registerTsProject(path, configFilename) {
    const tsConfigPath = configFilename ? (0, path_1.join)(path, configFilename) : path;
    const compilerOptions = readCompilerOptions(tsConfigPath);
    const cleanupFunctions = [
        registerTsConfigPaths(tsConfigPath),
        registerTranspiler(compilerOptions),
    ];
    // Add ESM support for `.ts` files.
    // NOTE: There is no cleanup function for this, as it's not possible to unregister the loader.
    //       Based on limited testing, it doesn't seem to matter if we register it multiple times, but just in
    //       case let's keep a flag to prevent it.
    if (!isTsEsmLoaderRegistered) {
        const module = require('node:module');
        if (module.register && packageIsInstalled('ts-node/esm')) {
            const url = require('node:url');
            module.register(url.pathToFileURL(require.resolve('ts-node/esm')));
        }
        isTsEsmLoaderRegistered = true;
    }
    return () => {
        for (const fn of cleanupFunctions) {
            fn();
        }
    };
}
exports.registerTsProject = registerTsProject;
function getSwcTranspiler(compilerOptions) {
    // These are requires to prevent it from registering when it shouldn't
    const register = require('@swc-node/register/register')
        .register;
    const cleanupFn = register(compilerOptions);
    return typeof cleanupFn === 'function' ? cleanupFn : () => { };
}
exports.getSwcTranspiler = getSwcTranspiler;
function getTsNodeTranspiler(compilerOptions, tsNodeOptions) {
    const { register } = require('ts-node');
    // ts-node doesn't provide a cleanup method
    const service = register({
        transpileOnly: true,
        compilerOptions: getTsNodeCompilerOptions(compilerOptions),
        // we already read and provide the compiler options, so prevent ts-node from reading them again
        skipProject: true,
    });
    const { transpiler, swc } = service.options;
    // Don't warn if a faster transpiler is enabled
    if (!transpiler && !swc) {
        warnTsNodeUsage();
    }
    return () => {
        service.enabled(false);
    };
}
exports.getTsNodeTranspiler = getTsNodeTranspiler;
/**
 * Given the raw "ts-node" sub-object from a tsconfig, return an object with only the properties
 * recognized by "ts-node"
 *
 * Adapted from the function of the same name in ts-node
 */
function filterRecognizedTsConfigTsNodeOptions(jsonObject) {
    if (typeof jsonObject !== 'object' || jsonObject === null) {
        return { recognized: {}, unrecognized: {} };
    }
    const { compiler, compilerHost, compilerOptions, emit, files, ignore, ignoreDiagnostics, logError, preferTsExts, pretty, require, skipIgnore, transpileOnly, typeCheck, transpiler, scope, scopeDir, moduleTypes, experimentalReplAwait, swc, experimentalResolver, esm, experimentalSpecifierResolution, experimentalTsImportSpecifiers, ...unrecognized } = jsonObject;
    const filteredTsConfigOptions = {
        compiler,
        compilerHost,
        compilerOptions,
        emit,
        experimentalReplAwait,
        files,
        ignore,
        ignoreDiagnostics,
        logError,
        preferTsExts,
        pretty,
        require,
        skipIgnore,
        transpileOnly,
        typeCheck,
        transpiler,
        scope,
        scopeDir,
        moduleTypes,
        swc,
        experimentalResolver,
        esm,
        experimentalSpecifierResolution,
        experimentalTsImportSpecifiers,
    };
    // Use the typechecker to make sure this implementation has the correct set of properties
    const catchExtraneousProps = null;
    const catchMissingProps = null;
    return { recognized: filteredTsConfigOptions, unrecognized };
}
function getTranspiler(compilerOptions, tsConfigRaw) {
    const preferTsNode = process.env.NX_PREFER_TS_NODE === 'true';
    if (!ts) {
        ts = require('typescript');
    }
    compilerOptions.lib = ['es2021'];
    compilerOptions.module = ts.ModuleKind.CommonJS;
    // use NodeJs module resolution until support for TS 4.x is dropped and then
    // we can switch to Node10
    compilerOptions.moduleResolution = ts.ModuleResolutionKind.NodeJs;
    compilerOptions.target = ts.ScriptTarget.ES2021;
    compilerOptions.inlineSourceMap = true;
    compilerOptions.skipLibCheck = true;
    if (swcNodeInstalled && !preferTsNode) {
        return () => getSwcTranspiler(compilerOptions);
    }
    // We can fall back on ts-node if it's available
    if (tsNodeInstalled) {
        const tsNodeOptions = filterRecognizedTsConfigTsNodeOptions(tsConfigRaw).recognized;
        return () => getTsNodeTranspiler(compilerOptions, tsNodeOptions);
    }
}
exports.getTranspiler = getTranspiler;
/**
 * Register ts-node or swc-node given a set of compiler options.
 *
 * Note: Several options require enums from typescript. To avoid importing typescript,
 * use import type + raw values
 *
 * @returns cleanup method
 */
function registerTranspiler(compilerOptions, tsConfigRaw) {
    // Function to register transpiler that returns cleanup function
    const transpiler = getTranspiler(compilerOptions);
    if (!transpiler) {
        warnNoTranspiler();
        return () => { };
    }
    return transpiler();
}
exports.registerTranspiler = registerTranspiler;
/**
 * @param tsConfigPath Adds the paths from a tsconfig file into node resolutions
 * @returns cleanup function
 */
function registerTsConfigPaths(tsConfigPath) {
    try {
        /**
         * Load the ts config from the source project
         */
        const tsconfigPaths = loadTsConfigPaths();
        const tsConfigResult = tsconfigPaths.loadConfig(tsConfigPath);
        /**
         * Register the custom workspace path mappings with node so that workspace libraries
         * can be imported and used within project
         */
        if (tsConfigResult.resultType === 'success') {
            return tsconfigPaths.register({
                baseUrl: tsConfigResult.absoluteBaseUrl,
                paths: tsConfigResult.paths,
            });
        }
    }
    catch (err) {
        if (err instanceof Error) {
            throw new Error(`Unable to load ${tsConfigPath}: ` + err.message);
        }
    }
    throw new Error(`Unable to load ${tsConfigPath}`);
}
exports.registerTsConfigPaths = registerTsConfigPaths;
function readCompilerOptions(tsConfigPath) {
    const preferTsNode = process.env.NX_PREFER_TS_NODE === 'true';
    if (swcNodeInstalled && !preferTsNode) {
        return readCompilerOptionsWithSwc(tsConfigPath);
    }
    else {
        return readCompilerOptionsWithTypescript(tsConfigPath);
    }
}
function readCompilerOptionsWithSwc(tsConfigPath) {
    const { readDefaultTsConfig, } = require('@swc-node/register/read-default-tsconfig');
    const compilerOptions = readDefaultTsConfig(tsConfigPath);
    // This is returned in compiler options for some reason, but not part of the typings.
    // @swc-node/register filters the files to transpile based on it, but it can be limiting when processing
    // files not part of the received tsconfig included files (e.g. shared helpers, or config files not in source, etc.).
    delete compilerOptions.files;
    return compilerOptions;
}
function readCompilerOptionsWithTypescript(tsConfigPath) {
    if (!ts) {
        ts = require('typescript');
    }
    const { readConfigFile, parseJsonConfigFileContent, sys } = ts;
    const jsonContent = readConfigFile(tsConfigPath, sys.readFile);
    const { options } = parseJsonConfigFileContent(jsonContent.config, sys, (0, path_1.dirname)(tsConfigPath));
    // This property is returned in compiler options for some reason, but not part of the typings.
    // ts-node fails on unknown props, so we have to remove it.
    delete options.configFilePath;
    return options;
}
function loadTsConfigPaths() {
    try {
        return require('tsconfig-paths');
    }
    catch {
        warnNoTsconfigPaths();
    }
}
function warnTsNodeUsage() {
    logger_1.logger.warn((0, logger_1.stripIndent)(`${logger_1.NX_PREFIX} Falling back to ts-node for local typescript execution. This may be a little slower.
  - To fix this, ensure @swc-node/register and @swc/core have been installed`));
}
function warnNoTsconfigPaths() {
    logger_1.logger.warn((0, logger_1.stripIndent)(`${logger_1.NX_PREFIX} Unable to load tsconfig-paths, workspace libraries may be inaccessible.
  - To fix this, install tsconfig-paths with npm/yarn/pnpm`));
}
function warnNoTranspiler() {
    logger_1.logger.warn((0, logger_1.stripIndent)(`${logger_1.NX_PREFIX} Unable to locate swc-node or ts-node. Nx will be unable to run local ts files without transpiling.
  - To fix this, ensure @swc-node/register and @swc/core have been installed`));
}
function packageIsInstalled(m) {
    try {
        const p = require.resolve(m);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * ts-node requires string values for enum based typescript options.
 * `register`'s signature just types the field as `object`, so we
 * unfortunately do not get any kind of type safety on this.
 */
function getTsNodeCompilerOptions(compilerOptions) {
    if (!ts) {
        ts = require('typescript');
    }
    const flagMap = {
        module: 'ModuleKind',
        target: 'ScriptTarget',
        moduleDetection: 'ModuleDetectionKind',
        newLine: 'NewLineKind',
        moduleResolution: 'ModuleResolutionKind',
        importsNotUsedAsValues: 'ImportsNotUsedAsValues',
    };
    const result = {
        ...compilerOptions,
    };
    for (const flag in flagMap) {
        if (compilerOptions[flag]) {
            result[flag] = ts[flagMap[flag]][compilerOptions[flag]];
        }
    }
    delete result.pathsBasePath;
    delete result.configFilePath;
    // instead of mapping to enum value we just remove it as it shouldn't ever need to be set for ts-node
    delete result.jsx;
    // lib option is in the format `lib.es2022.d.ts`, so we need to remove the leading `lib.` and trailing `.d.ts` to make it valid
    result.lib = result.lib?.map((value) => {
        return value.replace(/^lib\./, '').replace(/\.d\.ts$/, '');
    });
    if (result.moduleResolution) {
        result.moduleResolution =
            result.moduleResolution === 'NodeJs'
                ? 'node'
                : result.moduleResolution.toLowerCase();
    }
    return result;
}
exports.getTsNodeCompilerOptions = getTsNodeCompilerOptions;

import { InputDefinition, ProjectMetadata, TargetConfiguration } from '../config/workspace-json-project-json';
import { PackageManagerCommands } from './package-manager';
export interface NxProjectPackageJsonConfiguration {
    name?: string;
    implicitDependencies?: string[];
    tags?: string[];
    namedInputs?: {
        [inputName: string]: (string | InputDefinition)[];
    };
    targets?: Record<string, TargetConfiguration>;
    includedScripts?: string[];
}
export type ArrayPackageGroup = {
    package: string;
    version: string;
}[];
export type MixedPackageGroup = (string | {
    package: string;
    version: string;
})[] | Record<string, string>;
export type PackageGroup = MixedPackageGroup | ArrayPackageGroup;
export interface NxMigrationsConfiguration {
    migrations?: string;
    packageGroup?: PackageGroup;
}
type PackageOverride = {
    [key: string]: string | PackageOverride;
};
export interface PackageJson {
    name: string;
    version: string;
    license?: string;
    private?: boolean;
    scripts?: Record<string, string>;
    type?: 'module' | 'commonjs';
    main?: string;
    types?: string;
    module?: string;
    exports?: string | Record<string, string | {
        types?: string;
        require?: string;
        import?: string;
    }>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    peerDependenciesMeta?: Record<string, {
        optional: boolean;
    }>;
    resolutions?: Record<string, string>;
    overrides?: PackageOverride;
    bin?: Record<string, string> | string;
    workspaces?: string[] | {
        packages: string[];
    };
    publishConfig?: Record<string, string>;
    nx?: NxProjectPackageJsonConfiguration;
    generators?: string;
    schematics?: string;
    builders?: string;
    executors?: string;
    'nx-migrations'?: string | NxMigrationsConfiguration;
    'ng-update'?: string | NxMigrationsConfiguration;
    packageManager?: string;
}
export declare function normalizePackageGroup(packageGroup: PackageGroup): ArrayPackageGroup;
export declare function readNxMigrateConfig(json: Partial<PackageJson>): NxMigrationsConfiguration & {
    packageGroup?: ArrayPackageGroup;
};
export declare function buildTargetFromScript(script: string, scripts: Record<string, string>, packageManagerCommand: PackageManagerCommands): TargetConfiguration;
export declare function getMetadataFromPackageJson(packageJson: PackageJson): ProjectMetadata;
export declare function readTargetsFromPackageJson(packageJson: PackageJson): Record<string, TargetConfiguration<any>>;
/**
 * Uses `require.resolve` to read the package.json for a module.
 *
 * This will fail if the module doesn't export package.json
 *
 * @returns package json contents and path
 */
export declare function readModulePackageJsonWithoutFallbacks(moduleSpecifier: string, requirePaths?: string[]): {
    packageJson: PackageJson;
    path: string;
};
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
export declare function readModulePackageJson(moduleSpecifier: string, requirePaths?: string[]): {
    packageJson: PackageJson;
    path: string;
};
export {};

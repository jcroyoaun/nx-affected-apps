import { Tree } from '../../../../generators/tree';
export declare const nxWrapperPath: (p?: typeof import('path')) => string;
export declare function generateDotNxSetup(version?: string): void;
export declare function normalizeVersionForNxJson(pkg: string, version: string): string;
export declare function writeMinimalNxJson(host: Tree, version: string): void;
export declare function updateGitIgnore(host: Tree): void;
export declare function getNxWrapperContents(): string;
export declare function sanitizeWrapperScript(input: string): string;

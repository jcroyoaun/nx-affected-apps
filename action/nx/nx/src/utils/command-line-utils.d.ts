import type { Arguments } from 'yargs';
import { NxJsonConfiguration } from '../config/nx-json';
import { ProjectGraph } from '../config/project-graph';
export interface RawNxArgs extends NxArgs {
    prod?: boolean;
}
export interface NxArgs {
    targets?: string[];
    configuration?: string;
    runner?: string;
    parallel?: number;
    untracked?: boolean;
    uncommitted?: boolean;
    all?: boolean;
    base?: string;
    head?: string;
    exclude?: string[];
    files?: string[];
    verbose?: boolean;
    help?: boolean;
    version?: boolean;
    plain?: boolean;
    projects?: string[];
    select?: string;
    graph?: string | boolean;
    skipNxCache?: boolean;
    outputStyle?: string;
    nxBail?: boolean;
    nxIgnoreCycles?: boolean;
    type?: string;
    batch?: boolean;
}
export declare function createOverrides(__overrides_unparsed__?: string[]): Record<string, any>;
export declare function splitArgsIntoNxArgsAndOverrides(args: {
    [k: string]: any;
}, mode: 'run-one' | 'run-many' | 'affected' | 'print-affected', options: {
    printWarnings: boolean;
}, nxJson: NxJsonConfiguration): {
    nxArgs: NxArgs;
    overrides: Arguments & {
        __overrides_unparsed__: string[];
    };
};
export declare function parseFiles(options: NxArgs): {
    files: string[];
};
export declare function getProjectRoots(projectNames: string[], { nodes }: ProjectGraph): string[];
export declare function readGraphFileFromGraphArg({ graph }: Pick<NxArgs, 'graph'>): string;

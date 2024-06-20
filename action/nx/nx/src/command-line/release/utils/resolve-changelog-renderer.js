"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveChangelogRenderer = void 0;
const register_1 = require("../../../plugins/js/utils/register");
const typescript_1 = require("../../../plugins/js/utils/typescript");
const utils_1 = require("../../../tasks-runner/utils");
const workspace_root_1 = require("../../../utils/workspace-root");
function resolveChangelogRenderer(changelogRendererPath) {
    const interpolatedChangelogRendererPath = (0, utils_1.interpolate)(changelogRendererPath, {
        workspaceRoot: workspace_root_1.workspaceRoot,
    });
    // Try and load the provided (or default) changelog renderer
    let changelogRenderer;
    let cleanupTranspiler = () => { };
    try {
        const rootTsconfigPath = (0, typescript_1.getRootTsConfigPath)();
        if (rootTsconfigPath) {
            cleanupTranspiler = (0, register_1.registerTsProject)(rootTsconfigPath);
        }
        const r = require(interpolatedChangelogRendererPath);
        changelogRenderer = r.default || r;
    }
    catch (err) {
        throw err;
    }
    finally {
        cleanupTranspiler();
    }
    return changelogRenderer;
}
exports.resolveChangelogRenderer = resolveChangelogRenderer;

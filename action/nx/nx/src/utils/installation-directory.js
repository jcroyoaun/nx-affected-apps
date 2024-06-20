"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNxRequirePaths = exports.getNxInstallationPath = void 0;
const path_1 = require("path");
const workspace_root_1 = require("./workspace-root");
function getNxInstallationPath(root = workspace_root_1.workspaceRoot) {
    return (0, path_1.join)(root, '.nx', 'installation');
}
exports.getNxInstallationPath = getNxInstallationPath;
function getNxRequirePaths(root = workspace_root_1.workspaceRoot) {
    return [root, getNxInstallationPath(root)];
}
exports.getNxRequirePaths = getNxRequirePaths;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateNxJson = exports.readNxJson = void 0;
const path_1 = require("path");
const json_1 = require("./json");
const nx_json_1 = require("../../config/nx-json");
/**
 * Reads nx.json
 */
function readNxJson(tree) {
    if (tree) {
        if (!tree.exists('nx.json')) {
            return null;
        }
        let nxJson = (0, json_1.readJson)(tree, 'nx.json');
        if (nxJson.extends) {
            nxJson = { ...readNxJsonExtends(tree, nxJson.extends), ...nxJson };
        }
        return nxJson;
    }
    else {
        return (0, nx_json_1.readNxJson)();
    }
}
exports.readNxJson = readNxJson;
/**
 * Update nx.json
 */
function updateNxJson(tree, nxJson) {
    if (tree.exists('nx.json')) {
        (0, json_1.updateJson)(tree, 'nx.json', (json) => {
            if (json.extends) {
                const nxJsonExtends = readNxJsonExtends(tree, json.extends);
                const changedPropsOfNxJson = {};
                Object.keys(nxJson).forEach((prop) => {
                    if (JSON.stringify(nxJson[prop], null, 2) !=
                        JSON.stringify(nxJsonExtends[prop], null, 2)) {
                        changedPropsOfNxJson[prop] = nxJson[prop];
                    }
                });
                return changedPropsOfNxJson;
            }
            else {
                return nxJson;
            }
        });
    }
}
exports.updateNxJson = updateNxJson;
function readNxJsonExtends(tree, extendsPath) {
    try {
        return (0, json_1.readJson)(tree, (0, path_1.relative)(tree.root, require.resolve(extendsPath, {
            paths: [tree.root],
        })));
    }
    catch (e) {
        throw new Error(`Unable to resolve nx.json extends. Error: ${e.message}`);
    }
}

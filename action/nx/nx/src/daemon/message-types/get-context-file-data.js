"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isHandleContextFileDataMessage = exports.GET_CONTEXT_FILE_DATA = void 0;
exports.GET_CONTEXT_FILE_DATA = 'GET_CONTEXT_FILE_DATA';
function isHandleContextFileDataMessage(message) {
    return (typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        message['type'] === exports.GET_CONTEXT_FILE_DATA);
}
exports.isHandleContextFileDataMessage = isHandleContextFileDataMessage;

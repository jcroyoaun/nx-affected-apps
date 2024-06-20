"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.daemonClient = exports.DaemonClient = void 0;
const workspace_root_1 = require("../../utils/workspace-root");
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const fs_extra_1 = require("fs-extra");
const net_1 = require("net");
const path_1 = require("path");
const perf_hooks_1 = require("perf_hooks");
const output_1 = require("../../utils/output");
const socket_utils_1 = require("../socket-utils");
const tmp_dir_1 = require("../tmp-dir");
const is_ci_1 = require("../../utils/is-ci");
const configuration_1 = require("../../config/configuration");
const promised_based_queue_1 = require("../../utils/promised-based-queue");
const nx_json_1 = require("../../config/nx-json");
const daemon_socket_messenger_1 = require("./daemon-socket-messenger");
const cache_1 = require("../cache");
const error_types_1 = require("../../project-graph/error-types");
const get_nx_workspace_files_1 = require("../message-types/get-nx-workspace-files");
const get_context_file_data_1 = require("../message-types/get-context-file-data");
const get_files_in_directory_1 = require("../message-types/get-files-in-directory");
const hash_glob_1 = require("../message-types/hash-glob");
const DAEMON_ENV_SETTINGS = {
    NX_PROJECT_GLOB_CACHE: 'false',
    NX_CACHE_PROJECTS_CONFIG: 'false',
};
var DaemonStatus;
(function (DaemonStatus) {
    DaemonStatus[DaemonStatus["CONNECTING"] = 0] = "CONNECTING";
    DaemonStatus[DaemonStatus["DISCONNECTED"] = 1] = "DISCONNECTED";
    DaemonStatus[DaemonStatus["CONNECTED"] = 2] = "CONNECTED";
})(DaemonStatus || (DaemonStatus = {}));
class DaemonClient {
    constructor() {
        this._daemonStatus = DaemonStatus.DISCONNECTED;
        this._waitForDaemonReady = null;
        this._daemonReady = null;
        this._out = null;
        this._err = null;
        try {
            this.nxJson = (0, configuration_1.readNxJson)();
        }
        catch (e) {
            this.nxJson = null;
        }
        this.reset();
    }
    enabled() {
        if (this._enabled === undefined) {
            // TODO(v19): Add migration to move it out of existing configs and remove the ?? here.
            const useDaemonProcessOption = this.nxJson?.useDaemonProcess ??
                this.nxJson?.tasksRunnerOptions?.['default']?.options?.useDaemonProcess;
            const env = process.env.NX_DAEMON;
            // env takes precedence
            // option=true,env=false => no daemon
            // option=false,env=undefined => no daemon
            // option=false,env=false => no daemon
            // option=undefined,env=undefined => daemon
            // option=true,env=true => daemon
            // option=false,env=true => daemon
            // CI=true,env=undefined => no daemon
            // CI=true,env=false => no daemon
            // CI=true,env=true => daemon
            if (((0, is_ci_1.isCI)() && env !== 'true') ||
                isDocker() ||
                (0, tmp_dir_1.isDaemonDisabled)() ||
                nxJsonIsNotPresent() ||
                (useDaemonProcessOption === undefined && env === 'false') ||
                (useDaemonProcessOption === true && env === 'false') ||
                (useDaemonProcessOption === false && env === undefined) ||
                (useDaemonProcessOption === false && env === 'false')) {
                this._enabled = false;
            }
            else {
                this._enabled = true;
            }
        }
        return this._enabled;
    }
    reset() {
        this.socketMessenger?.close();
        this.socketMessenger = null;
        this.queue = new promised_based_queue_1.PromisedBasedQueue();
        this.currentMessage = null;
        this.currentResolve = null;
        this.currentReject = null;
        this._enabled = undefined;
        this._out?.close();
        this._err?.close();
        this._out = null;
        this._err = null;
        this._daemonStatus = DaemonStatus.DISCONNECTED;
        this._waitForDaemonReady = new Promise((resolve) => (this._daemonReady = resolve));
    }
    async requestShutdown() {
        return this.sendToDaemonViaQueue({ type: 'REQUEST_SHUTDOWN' });
    }
    async getProjectGraphAndSourceMaps() {
        try {
            const response = await this.sendToDaemonViaQueue({
                type: 'REQUEST_PROJECT_GRAPH',
            });
            return {
                projectGraph: response.projectGraph,
                sourceMaps: response.sourceMaps,
            };
        }
        catch (e) {
            if (e.name === error_types_1.DaemonProjectGraphError.name) {
                throw error_types_1.ProjectGraphError.fromDaemonProjectGraphError(e);
            }
            else {
                throw e;
            }
        }
    }
    async getAllFileData() {
        return await this.sendToDaemonViaQueue({ type: 'REQUEST_FILE_DATA' });
    }
    hashTasks(runnerOptions, tasks, taskGraph, env) {
        return this.sendToDaemonViaQueue({
            type: 'HASH_TASKS',
            runnerOptions,
            env,
            tasks,
            taskGraph,
        });
    }
    async registerFileWatcher(config, callback) {
        try {
            await this.getProjectGraphAndSourceMaps();
        }
        catch (e) {
            if (config.allowPartialGraph && e instanceof error_types_1.ProjectGraphError) {
                // we are fine with partial graph
            }
            else {
                throw e;
            }
        }
        let messenger;
        await this.queue.sendToQueue(() => {
            messenger = new daemon_socket_messenger_1.DaemonSocketMessenger((0, net_1.connect)((0, socket_utils_1.getFullOsSocketPath)())).listen((message) => {
                try {
                    const parsedMessage = JSON.parse(message);
                    callback(null, parsedMessage);
                }
                catch (e) {
                    callback(e, null);
                }
            }, () => {
                callback('closed', null);
            }, (err) => callback(err, null));
            return messenger.sendMessage({ type: 'REGISTER_FILE_WATCHER', config });
        });
        return () => {
            messenger?.close();
        };
    }
    processInBackground(requirePath, data) {
        return this.sendToDaemonViaQueue({
            type: 'PROCESS_IN_BACKGROUND',
            requirePath,
            data,
        });
    }
    recordOutputsHash(outputs, hash) {
        return this.sendToDaemonViaQueue({
            type: 'RECORD_OUTPUTS_HASH',
            data: {
                outputs,
                hash,
            },
        });
    }
    outputsHashesMatch(outputs, hash) {
        return this.sendToDaemonViaQueue({
            type: 'OUTPUTS_HASHES_MATCH',
            data: {
                outputs,
                hash,
            },
        });
    }
    glob(globs, exclude) {
        const message = {
            type: 'GLOB',
            globs,
            exclude,
        };
        return this.sendToDaemonViaQueue(message);
    }
    getWorkspaceContextFileData() {
        const message = {
            type: get_context_file_data_1.GET_CONTEXT_FILE_DATA,
        };
        return this.sendToDaemonViaQueue(message);
    }
    getWorkspaceFiles(projectRootMap) {
        const message = {
            type: get_nx_workspace_files_1.GET_NX_WORKSPACE_FILES,
            projectRootMap,
        };
        return this.sendToDaemonViaQueue(message);
    }
    getFilesInDirectory(dir) {
        const message = {
            type: get_files_in_directory_1.GET_FILES_IN_DIRECTORY,
            dir,
        };
        return this.sendToDaemonViaQueue(message);
    }
    hashGlob(globs, exclude) {
        const message = {
            type: hash_glob_1.HASH_GLOB,
            globs,
            exclude,
        };
        return this.sendToDaemonViaQueue(message);
    }
    async isServerAvailable() {
        return new Promise((resolve) => {
            try {
                const socket = (0, net_1.connect)((0, socket_utils_1.getFullOsSocketPath)(), () => {
                    socket.destroy();
                    resolve(true);
                });
                socket.once('error', () => {
                    resolve(false);
                });
            }
            catch (err) {
                resolve(false);
            }
        });
    }
    async sendToDaemonViaQueue(messageToDaemon) {
        return this.queue.sendToQueue(() => this.sendMessageToDaemon(messageToDaemon));
    }
    setUpConnection() {
        this.socketMessenger = new daemon_socket_messenger_1.DaemonSocketMessenger((0, net_1.connect)((0, socket_utils_1.getFullOsSocketPath)())).listen((message) => this.handleMessage(message), () => {
            // it's ok for the daemon to terminate if the client doesn't wait on
            // any messages from the daemon
            if (this.queue.isEmpty()) {
                this.reset();
            }
            else {
                output_1.output.error({
                    title: 'Daemon process terminated and closed the connection',
                    bodyLines: [
                        'Please rerun the command, which will restart the daemon.',
                        `If you get this error again, check for any errors in the daemon process logs found in: ${tmp_dir_1.DAEMON_OUTPUT_LOG_FILE}`,
                    ],
                });
                this._daemonStatus = DaemonStatus.DISCONNECTED;
                this.currentReject?.(daemonProcessException('Daemon process terminated and closed the connection'));
                process.exit(1);
            }
        }, (err) => {
            if (!err.message) {
                return this.currentReject(daemonProcessException(err.toString()));
            }
            if (err.message.startsWith('LOCK-FILES-CHANGED')) {
                // retry the current message
                // we cannot send it via the queue because we are in the middle of processing
                // a message from the queue
                return this.sendMessageToDaemon(this.currentMessage).then(this.currentResolve, this.currentReject);
            }
            let error;
            if (err.message.startsWith('connect ENOENT')) {
                error = daemonProcessException('The Daemon Server is not running');
            }
            else if (err.message.startsWith('connect ECONNREFUSED')) {
                error = daemonProcessException(`A server instance had not been fully shut down. Please try running the command again.`);
                (0, socket_utils_1.killSocketOrPath)();
            }
            else if (err.message.startsWith('read ECONNRESET')) {
                error = daemonProcessException(`Unable to connect to the daemon process.`);
            }
            else {
                error = daemonProcessException(err.toString());
            }
            return this.currentReject(error);
        });
    }
    async sendMessageToDaemon(message) {
        if (this._daemonStatus == DaemonStatus.DISCONNECTED) {
            this._daemonStatus = DaemonStatus.CONNECTING;
            if (!(await this.isServerAvailable())) {
                await this.startInBackground();
            }
            this.setUpConnection();
            this._daemonStatus = DaemonStatus.CONNECTED;
            this._daemonReady();
        }
        else if (this._daemonStatus == DaemonStatus.CONNECTING) {
            await this._waitForDaemonReady;
        }
        return new Promise((resolve, reject) => {
            perf_hooks_1.performance.mark('sendMessageToDaemon-start');
            this.currentMessage = message;
            this.currentResolve = resolve;
            this.currentReject = reject;
            this.socketMessenger.sendMessage(message);
        });
    }
    handleMessage(serializedResult) {
        try {
            perf_hooks_1.performance.mark('json-parse-start');
            const parsedResult = JSON.parse(serializedResult);
            perf_hooks_1.performance.mark('json-parse-end');
            perf_hooks_1.performance.measure('deserialize daemon response', 'json-parse-start', 'json-parse-end');
            if (parsedResult.error) {
                this.currentReject(parsedResult.error);
            }
            else {
                perf_hooks_1.performance.measure('total for sendMessageToDaemon()', 'sendMessageToDaemon-start', 'json-parse-end');
                return this.currentResolve(parsedResult);
            }
        }
        catch (e) {
            const endOfResponse = serializedResult.length > 300
                ? serializedResult.substring(serializedResult.length - 300)
                : serializedResult;
            this.currentReject(daemonProcessException([
                'Could not deserialize response from Nx daemon.',
                `Message: ${e.message}`,
                '\n',
                `Received:`,
                endOfResponse,
                '\n',
            ].join('\n')));
        }
    }
    async startInBackground() {
        (0, fs_extra_1.ensureDirSync)(tmp_dir_1.DAEMON_DIR_FOR_CURRENT_WORKSPACE);
        (0, fs_extra_1.ensureFileSync)(tmp_dir_1.DAEMON_OUTPUT_LOG_FILE);
        this._out = await (0, promises_1.open)(tmp_dir_1.DAEMON_OUTPUT_LOG_FILE, 'a');
        this._err = await (0, promises_1.open)(tmp_dir_1.DAEMON_OUTPUT_LOG_FILE, 'a');
        const backgroundProcess = (0, child_process_1.spawn)(process.execPath, [(0, path_1.join)(__dirname, `../server/start.js`)], {
            cwd: workspace_root_1.workspaceRoot,
            stdio: ['ignore', this._out.fd, this._err.fd],
            detached: true,
            windowsHide: true,
            shell: false,
            env: {
                ...process.env,
                ...DAEMON_ENV_SETTINGS,
            },
        });
        backgroundProcess.unref();
        /**
         * Ensure the server is actually available to connect to via IPC before resolving
         */
        let attempts = 0;
        return new Promise((resolve, reject) => {
            const id = setInterval(async () => {
                if (await this.isServerAvailable()) {
                    clearInterval(id);
                    resolve(backgroundProcess.pid);
                }
                else if (attempts > 6000) {
                    // daemon fails to start, the process probably exited
                    // we print the logs and exit the client
                    reject(daemonProcessException('Failed to start or connect to the Nx Daemon process.'));
                }
                else {
                    attempts++;
                }
            }, 10);
        });
    }
    async stop() {
        try {
            await (0, cache_1.safelyCleanUpExistingProcess)();
        }
        catch (err) {
            output_1.output.error({
                title: err?.message ||
                    'Something unexpected went wrong when stopping the server',
            });
        }
        (0, tmp_dir_1.removeSocketDir)();
    }
}
exports.DaemonClient = DaemonClient;
exports.daemonClient = new DaemonClient();
function isDocker() {
    try {
        (0, fs_1.statSync)('/.dockerenv');
        return true;
    }
    catch {
        try {
            return (0, fs_1.readFileSync)('/proc/self/cgroup', 'utf8')?.includes('docker');
        }
        catch { }
        return false;
    }
}
function nxJsonIsNotPresent() {
    return !(0, nx_json_1.hasNxJson)(workspace_root_1.workspaceRoot);
}
function daemonProcessException(message) {
    try {
        let log = (0, fs_1.readFileSync)(tmp_dir_1.DAEMON_OUTPUT_LOG_FILE).toString().split('\n');
        if (log.length > 20) {
            log = log.slice(log.length - 20);
        }
        const error = new Error([
            message,
            '',
            'Messages from the log:',
            ...log,
            '\n',
            `More information: ${tmp_dir_1.DAEMON_OUTPUT_LOG_FILE}`,
        ].join('\n'));
        error.internalDaemonError = true;
        return error;
    }
    catch (e) {
        return new Error(message);
    }
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRunManyDynamicOutputRenderer = void 0;
const cliCursor = require("cli-cursor");
const cli_spinners_1 = require("cli-spinners");
const os_1 = require("os");
const readline = require("readline");
const output_1 = require("../../utils/output");
const pretty_time_1 = require("./pretty-time");
const formatting_utils_1 = require("./formatting-utils");
const view_logs_utils_1 = require("./view-logs-utils");
const LEFT_PAD = `   `;
const SPACER = `  `;
const EXTENDED_LEFT_PAD = `      `;
/**
 * The following function is responsible for creating a life cycle with dynamic
 * outputs, meaning previous outputs can be rewritten or modified as new outputs
 * are added. It is therefore intended for use on a user's local machines.
 *
 * In CI environments the static equivalent of this life cycle should be used.
 *
 * NOTE: output.dim() should be preferred over output.colors.gray() because it
 * is much more consistently readable across different terminal color themes.
 */
async function createRunManyDynamicOutputRenderer({ projectNames, tasks, args, overrides, }) {
    cliCursor.hide();
    // Show the cursor again after the process exits
    process.on('exit', () => {
        cliCursor.show();
    });
    let resolveRenderIsDonePromise;
    const renderIsDone = new Promise((resolve) => (resolveRenderIsDonePromise = resolve)).then(() => {
        clearRenderInterval();
        cliCursor.show();
    });
    function clearRenderInterval() {
        if (renderIntervalId) {
            clearInterval(renderIntervalId);
        }
    }
    process.on('exit', () => clearRenderInterval());
    process.on('SIGINT', () => clearRenderInterval());
    process.on('SIGTERM', () => clearRenderInterval());
    process.on('SIGHUP', () => clearRenderInterval());
    const lifeCycle = {};
    const isVerbose = overrides.verbose === true;
    const start = process.hrtime();
    const figures = await Promise.resolve().then(() => require('figures'));
    const targets = args.targets;
    const totalTasks = tasks.length;
    const taskRows = tasks.map((task) => {
        return {
            task,
            status: 'pending',
        };
    });
    const failedTasks = new Set();
    const tasksToTerminalOutputs = {};
    const tasksToProcessStartTimes = {};
    let hasTaskOutput = false;
    let pinnedFooterNumLines = 0;
    let totalCompletedTasks = 0;
    let totalSuccessfulTasks = 0;
    let totalFailedTasks = 0;
    let totalCachedTasks = 0;
    // Used to control the rendering of the spinner on each project row
    let currentFrame = 0;
    let renderIntervalId;
    const moveCursorToStartOfPinnedFooter = () => {
        readline.moveCursor(process.stdout, 0, -pinnedFooterNumLines);
    };
    const renderPinnedFooter = (lines, dividerColor = 'cyan') => {
        let additionalLines = 0;
        if (hasTaskOutput) {
            const dividerLines = output_1.output.getVerticalSeparatorLines(dividerColor);
            for (const line of dividerLines) {
                output_1.output.overwriteLine(line);
            }
            additionalLines += dividerLines.length;
        }
        // Create vertical breathing room for cursor position under the pinned footer
        lines.push('');
        for (const line of lines) {
            output_1.output.overwriteLine(line);
        }
        pinnedFooterNumLines = lines.length + additionalLines;
        // clear any possible text below the cursor's position
        readline.clearScreenDown(process.stdout);
    };
    const printTaskResult = (task, status) => {
        moveCursorToStartOfPinnedFooter();
        // If this is the very first output, add some vertical breathing room
        if (!hasTaskOutput) {
            output_1.output.addNewline();
        }
        hasTaskOutput = true;
        switch (status) {
            case 'local-cache':
                writeCompletedTaskResultLine(`${output_1.output.colors.green(figures.tick) +
                    SPACER +
                    output_1.output.formatCommand(task.id)}  ${output_1.output.dim('[local cache]')}`);
                if (isVerbose) {
                    writeCommandOutputBlock(tasksToTerminalOutputs[task.id]);
                }
                break;
            case 'local-cache-kept-existing':
                writeCompletedTaskResultLine(`${output_1.output.colors.green(figures.tick) +
                    SPACER +
                    output_1.output.formatCommand(task.id)}  ${output_1.output.dim('[existing outputs match the cache, left as is]')}`);
                if (isVerbose) {
                    writeCommandOutputBlock(tasksToTerminalOutputs[task.id]);
                }
                break;
            case 'remote-cache':
                writeCompletedTaskResultLine(`${output_1.output.colors.green(figures.tick) +
                    SPACER +
                    output_1.output.formatCommand(task.id)}  ${output_1.output.dim('[remote cache]')}`);
                if (isVerbose) {
                    writeCommandOutputBlock(tasksToTerminalOutputs[task.id]);
                }
                break;
            case 'success': {
                const timeTakenText = (0, pretty_time_1.prettyTime)(process.hrtime(tasksToProcessStartTimes[task.id]));
                writeCompletedTaskResultLine(output_1.output.colors.green(figures.tick) +
                    SPACER +
                    output_1.output.formatCommand(task.id) +
                    output_1.output.dim(` (${timeTakenText})`));
                if (isVerbose) {
                    writeCommandOutputBlock(tasksToTerminalOutputs[task.id]);
                }
                break;
            }
            case 'failure':
                output_1.output.addNewline();
                output_1.output.addNewline();
                writeCompletedTaskResultLine(output_1.output.colors.red(figures.cross) +
                    SPACER +
                    output_1.output.formatCommand(output_1.output.colors.red(task.id)));
                writeCommandOutputBlock(tasksToTerminalOutputs[task.id]);
                break;
        }
        delete tasksToTerminalOutputs[task.id];
        renderPinnedFooter([]);
        renderRows();
    };
    const renderRows = () => {
        const max = cli_spinners_1.dots.frames.length - 1;
        const curr = currentFrame;
        currentFrame = curr >= max ? 0 : curr + 1;
        const additionalFooterRows = [''];
        const runningTasks = taskRows.filter((row) => row.status === 'running');
        const remainingTasks = totalTasks - totalCompletedTasks;
        if (runningTasks.length > 0) {
            additionalFooterRows.push(output_1.output.dim(`${LEFT_PAD}${output_1.output.colors.cyan(figures.arrowRight)}${SPACER}Executing ${runningTasks.length}/${remainingTasks} remaining tasks${runningTasks.length > 1 ? ' in parallel' : ''}...`));
            additionalFooterRows.push('');
            for (const runningTask of runningTasks) {
                additionalFooterRows.push(`${LEFT_PAD}${output_1.output.dim.cyan(cli_spinners_1.dots.frames[currentFrame])}${SPACER}${output_1.output.formatCommand(runningTask.task.id)}`);
            }
            /**
             * Reduce layout thrashing by ensuring that there is a relatively consistent
             * height for the area in which the task rows are rendered.
             *
             * We can look at the parallel flag to know how many rows are likely to be
             * needed in the common case and always render that at least that many.
             */
            if (totalCompletedTasks !== totalTasks &&
                Number.isInteger(args.parallel) &&
                runningTasks.length < args.parallel) {
                // Don't bother with this optimization if there are fewer tasks remaining than rows required
                if (remainingTasks >= args.parallel) {
                    for (let i = runningTasks.length; i < args.parallel; i++) {
                        additionalFooterRows.push('');
                    }
                }
            }
        }
        if (totalSuccessfulTasks > 0 || totalFailedTasks > 0) {
            additionalFooterRows.push('');
        }
        if (totalSuccessfulTasks > 0) {
            additionalFooterRows.push(`${LEFT_PAD}${output_1.output.colors.green(figures.tick)}${SPACER}${totalSuccessfulTasks}${`/${totalCompletedTasks}`} succeeded ${output_1.output.dim(`[${totalCachedTasks} read from cache]`)}`);
        }
        if (totalFailedTasks > 0) {
            additionalFooterRows.push(`${LEFT_PAD}${output_1.output.colors.red(figures.cross)}${SPACER}${totalFailedTasks}${`/${totalCompletedTasks}`} failed`);
        }
        moveCursorToStartOfPinnedFooter();
        if (additionalFooterRows.length > 1) {
            const text = `Running ${(0, formatting_utils_1.formatTargetsAndProjects)(projectNames, targets, tasks)}`;
            const taskOverridesRows = [];
            if (Object.keys(overrides).length > 0) {
                taskOverridesRows.push('');
                taskOverridesRows.push(`${EXTENDED_LEFT_PAD}${output_1.output.dim.cyan('With additional flags:')}`);
                Object.entries(overrides)
                    .map(([flag, value]) => output_1.output.dim.cyan((0, formatting_utils_1.formatFlags)(EXTENDED_LEFT_PAD, flag, value)))
                    .forEach((arg) => taskOverridesRows.push(arg));
            }
            const pinnedFooterLines = [
                output_1.output.applyNxPrefix('cyan', output_1.output.colors.cyan(text)),
                ...taskOverridesRows,
                ...additionalFooterRows,
            ];
            // Vertical breathing room when there isn't yet any output or divider
            if (!hasTaskOutput) {
                pinnedFooterLines.unshift('');
            }
            renderPinnedFooter(pinnedFooterLines);
        }
        else {
            renderPinnedFooter([]);
        }
    };
    lifeCycle.startCommand = () => {
        if (projectNames.length <= 0) {
            renderPinnedFooter([
                '',
                output_1.output.applyNxPrefix('gray', `No projects with ${(0, formatting_utils_1.formatTargetsAndProjects)(projectNames, targets, tasks)} were run`),
            ]);
            resolveRenderIsDonePromise();
            return;
        }
        renderPinnedFooter([]);
    };
    lifeCycle.endCommand = () => {
        clearRenderInterval();
        const timeTakenText = (0, pretty_time_1.prettyTime)(process.hrtime(start));
        moveCursorToStartOfPinnedFooter();
        if (totalSuccessfulTasks === totalTasks) {
            const text = `Successfully ran ${(0, formatting_utils_1.formatTargetsAndProjects)(projectNames, targets, tasks)}`;
            const taskOverridesRows = [];
            if (Object.keys(overrides).length > 0) {
                taskOverridesRows.push('');
                taskOverridesRows.push(`${EXTENDED_LEFT_PAD}${output_1.output.dim.green('With additional flags:')}`);
                Object.entries(overrides)
                    .map(([flag, value]) => output_1.output.dim.green((0, formatting_utils_1.formatFlags)(EXTENDED_LEFT_PAD, flag, value)))
                    .forEach((arg) => taskOverridesRows.push(arg));
            }
            const pinnedFooterLines = [
                output_1.output.applyNxPrefix('green', output_1.output.colors.green(text) + output_1.output.dim.white(` (${timeTakenText})`)),
                ...taskOverridesRows,
            ];
            if (totalCachedTasks > 0) {
                pinnedFooterLines.push(output_1.output.dim(`${os_1.EOL}Nx read the output from the cache instead of running the command for ${totalCachedTasks} out of ${totalTasks} tasks.`));
            }
            renderPinnedFooter(pinnedFooterLines, 'green');
        }
        else {
            const text = `Ran ${(0, formatting_utils_1.formatTargetsAndProjects)(projectNames, targets, tasks)}`;
            const taskOverridesRows = [];
            if (Object.keys(overrides).length > 0) {
                taskOverridesRows.push('');
                taskOverridesRows.push(`${EXTENDED_LEFT_PAD}${output_1.output.dim.red('With additional flags:')}`);
                Object.entries(overrides)
                    .map(([flag, value]) => output_1.output.dim.red((0, formatting_utils_1.formatFlags)(EXTENDED_LEFT_PAD, flag, value)))
                    .forEach((arg) => taskOverridesRows.push(arg));
            }
            const numFailedToPrint = 5;
            const failedTasksForPrinting = Array.from(failedTasks).slice(0, numFailedToPrint);
            const failureSummaryRows = [
                output_1.output.applyNxPrefix('red', output_1.output.colors.red(text) + output_1.output.dim.white(` (${timeTakenText})`)),
                ...taskOverridesRows,
                '',
                output_1.output.dim(`${LEFT_PAD}${output_1.output.dim(figures.tick)}${SPACER}${totalSuccessfulTasks}${`/${totalCompletedTasks}`} succeeded ${output_1.output.dim(`[${totalCachedTasks} read from cache]`)}`),
                '',
                `${LEFT_PAD}${output_1.output.colors.red(figures.cross)}${SPACER}${totalFailedTasks}${`/${totalCompletedTasks}`} targets failed, including the following:`,
                '',
                `${failedTasksForPrinting
                    .map((t) => `${EXTENDED_LEFT_PAD}${output_1.output.colors.red('-')} ${output_1.output.formatCommand(t.toString())}`)
                    .join('\n')}`,
            ];
            if (failedTasks.size > numFailedToPrint) {
                failureSummaryRows.push(output_1.output.dim(`${EXTENDED_LEFT_PAD}...and ${failedTasks.size - numFailedToPrint} more...`));
            }
            failureSummaryRows.push(...(0, view_logs_utils_1.viewLogsFooterRows)(failedTasks.size));
            renderPinnedFooter(failureSummaryRows, 'red');
        }
        resolveRenderIsDonePromise();
    };
    lifeCycle.startTasks = (tasks) => {
        for (const task of tasks) {
            tasksToProcessStartTimes[task.id] = process.hrtime();
        }
        for (const taskRow of taskRows) {
            if (tasks.indexOf(taskRow.task) > -1) {
                taskRow.status = 'running';
            }
        }
        if (!renderIntervalId) {
            renderIntervalId = setInterval(renderRows, 100);
        }
    };
    lifeCycle.printTaskTerminalOutput = (task, _cacheStatus, output) => {
        tasksToTerminalOutputs[task.id] = output;
    };
    lifeCycle.endTasks = (taskResults) => {
        for (let t of taskResults) {
            totalCompletedTasks++;
            const matchingTaskRow = taskRows.find((r) => r.task.id === t.task.id);
            if (matchingTaskRow) {
                matchingTaskRow.status = t.status;
            }
            switch (t.status) {
                case 'remote-cache':
                case 'local-cache':
                case 'local-cache-kept-existing':
                    totalCachedTasks++;
                    totalSuccessfulTasks++;
                    break;
                case 'success':
                    totalSuccessfulTasks++;
                    break;
                case 'failure':
                    totalFailedTasks++;
                    failedTasks.add(t.task.id);
                    break;
            }
            printTaskResult(t.task, t.status);
        }
    };
    return { lifeCycle, renderIsDone };
}
exports.createRunManyDynamicOutputRenderer = createRunManyDynamicOutputRenderer;
function writeCompletedTaskResultLine(line) {
    output_1.output.overwriteLine(LEFT_PAD + line);
}
/**
 * There's not much we can do in order to "neaten up" the outputs of
 * commands we do not control, but at the very least we can trim any
 * leading whitespace and any _excess_ trailing newlines so that there
 * isn't unncecessary vertical whitespace.
 */
function writeCommandOutputBlock(commandOutput) {
    commandOutput = commandOutput || '';
    commandOutput = commandOutput.trimStart();
    const lines = commandOutput.split(/\r?\n/);
    let totalTrailingEmptyLines = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i] !== '') {
            break;
        }
        totalTrailingEmptyLines++;
    }
    if (totalTrailingEmptyLines > 1) {
        const linesToRemove = totalTrailingEmptyLines - 1;
        lines.splice(lines.length - linesToRemove, linesToRemove);
    }
    lines.push('');
    // Indent the command output to make it look more "designed" in the context of the dynamic output
    lines.forEach((l) => output_1.output.overwriteLine(`${EXTENDED_LEFT_PAD}${l}`));
}

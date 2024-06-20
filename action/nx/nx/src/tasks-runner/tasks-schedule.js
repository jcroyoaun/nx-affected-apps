"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TasksSchedule = void 0;
const utils_1 = require("./utils");
const project_graph_utils_1 = require("../utils/project-graph-utils");
const operators_1 = require("../project-graph/operators");
class TasksSchedule {
    constructor(projectGraph, taskGraph, options) {
        this.projectGraph = projectGraph;
        this.taskGraph = taskGraph;
        this.options = options;
        this.notScheduledTaskGraph = this.taskGraph;
        this.reverseTaskDeps = (0, utils_1.calculateReverseDeps)(this.taskGraph);
        this.reverseProjectGraph = (0, operators_1.reverse)(this.projectGraph);
        this.scheduledBatches = [];
        this.scheduledTasks = [];
        this.completedTasks = new Set();
        this.scheduleRequestsExecutionChain = Promise.resolve();
    }
    async scheduleNextTasks() {
        this.scheduleRequestsExecutionChain =
            this.scheduleRequestsExecutionChain.then(() => this.scheduleTasks());
        await this.scheduleRequestsExecutionChain;
    }
    hasTasks() {
        return (this.scheduledBatches.length +
            this.scheduledTasks.length +
            Object.keys(this.notScheduledTaskGraph.tasks).length !==
            0);
    }
    complete(taskIds) {
        for (const taskId of taskIds) {
            this.completedTasks.add(taskId);
        }
        this.notScheduledTaskGraph = (0, utils_1.removeTasksFromTaskGraph)(this.notScheduledTaskGraph, taskIds);
    }
    getAllScheduledTasks() {
        return {
            scheduledTasks: this.scheduledTasks,
            scheduledBatches: this.scheduledBatches,
        };
    }
    nextTask() {
        if (this.scheduledTasks.length > 0) {
            return this.taskGraph.tasks[this.scheduledTasks.shift()];
        }
        else {
            return null;
        }
    }
    nextBatch() {
        return this.scheduledBatches.length > 0
            ? this.scheduledBatches.shift()
            : null;
    }
    async scheduleTasks() {
        if (this.options.batch || process.env.NX_BATCH_MODE === 'true') {
            await this.scheduleBatches();
        }
        for (let root of this.notScheduledTaskGraph.roots) {
            if (this.canBeScheduled(root)) {
                await this.scheduleTask(root);
            }
        }
    }
    async scheduleTask(taskId) {
        this.notScheduledTaskGraph = (0, utils_1.removeTasksFromTaskGraph)(this.notScheduledTaskGraph, [taskId]);
        this.scheduledTasks = this.scheduledTasks
            .concat(taskId)
            // NOTE: sort task by most dependent on first
            .sort((taskId1, taskId2) => {
            // First compare the length of task dependencies.
            const taskDifference = this.reverseTaskDeps[taskId2].length -
                this.reverseTaskDeps[taskId1].length;
            if (taskDifference !== 0) {
                return taskDifference;
            }
            // Tie-breaker for tasks with equal number of task dependencies.
            // Most likely tasks with no dependencies such as test
            const project1 = this.taskGraph.tasks[taskId1].target.project;
            const project2 = this.taskGraph.tasks[taskId2].target.project;
            return ((0, project_graph_utils_1.findAllProjectNodeDependencies)(project2, this.reverseProjectGraph)
                .length -
                (0, project_graph_utils_1.findAllProjectNodeDependencies)(project1, this.reverseProjectGraph)
                    .length);
        });
    }
    async scheduleBatches() {
        const batchMap = {};
        for (const root of this.notScheduledTaskGraph.roots) {
            const rootTask = this.notScheduledTaskGraph.tasks[root];
            const executorName = (0, utils_1.getExecutorNameForTask)(rootTask, this.projectGraph);
            await this.processTaskForBatches(batchMap, rootTask, executorName, true);
        }
        for (const [executorName, taskGraph] of Object.entries(batchMap)) {
            this.scheduleBatch({ executorName, taskGraph });
        }
    }
    scheduleBatch({ executorName, taskGraph }) {
        // Create a new task graph without the tasks that are being scheduled as part of this batch
        this.notScheduledTaskGraph = (0, utils_1.removeTasksFromTaskGraph)(this.notScheduledTaskGraph, Object.keys(taskGraph.tasks));
        this.scheduledBatches.push({ executorName, taskGraph });
    }
    async processTaskForBatches(batches, task, rootExecutorName, isRoot) {
        if (!this.canBatchTaskBeScheduled(task.id, batches[rootExecutorName])) {
            return;
        }
        const { batchImplementationFactory } = (0, utils_1.getExecutorForTask)(task, this.projectGraph);
        const executorName = (0, utils_1.getExecutorNameForTask)(task, this.projectGraph);
        if (rootExecutorName !== executorName) {
            return;
        }
        if (!batchImplementationFactory) {
            return;
        }
        const batch = (batches[rootExecutorName] =
            batches[rootExecutorName] ??
                {
                    tasks: {},
                    dependencies: {},
                    roots: [],
                });
        batch.tasks[task.id] = task;
        batch.dependencies[task.id] =
            this.notScheduledTaskGraph.dependencies[task.id];
        if (isRoot) {
            batch.roots.push(task.id);
        }
        for (const dep of this.reverseTaskDeps[task.id]) {
            const depTask = this.taskGraph.tasks[dep];
            await this.processTaskForBatches(batches, depTask, rootExecutorName, false);
        }
    }
    canBatchTaskBeScheduled(taskId, batchTaskGraph) {
        // all deps have either completed or belong to the same batch
        return this.taskGraph.dependencies[taskId].every((id) => this.completedTasks.has(id) || !!batchTaskGraph?.tasks[id]);
    }
    canBeScheduled(taskId) {
        return this.taskGraph.dependencies[taskId].every((id) => this.completedTasks.has(id));
    }
}
exports.TasksSchedule = TasksSchedule;

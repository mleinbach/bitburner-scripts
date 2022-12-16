import { BatchRunner } from "./batchRunner";
import { BatchJob } from "./job";
import { ExecutionPlanBuilder, ExecutionPlan } from "./executionPlan";
import { Task } from "./task";

import { Logger } from "./logger";
import { Scheduler } from "./scheduler";

/** @param {NS} ns */
export async function main(ns) {
    let logger = new Logger(ns, "schedulerService");
    logger.disableNSLogs();
    let [tail = null, enableStats = null] = ns.args;

    if (tail !== null) {
        ns.tail();
    }

    if (enableStats !== null) {
        enableStats = true;
    }
    else {
        enableStats = false;
    }

    try {
        logger.info("Scheduler running.")
        //await new MockScheduler(ns, MockBatchRunner).run();
        await new MockScheduler(ns, BatchRunner, enableStats).run();
    } catch (e) {
        logger.error(`Unhandled exception occurred:\n${e.stack}`)
    }
}

class MockScheduler extends Scheduler {
    constructor(...args) {
        super(...args);
        this.untargetedServers = ["n00dles"];
    }
}

class MockBatchRunner extends BatchRunner {
    constructor(...args) {
        super(...args)
        this.executionPlanBuilder = MockExecutionPlanBuilder
    }

    checkTargetInitialization() {
        if (this.initializing) {
            this.initializing = false;
        }
    }
}

export class MockTask extends Task {
    /** 
     * @param {NS} ns
     * @param {String} target
     * @param {Number} finishOrder 
     * @param {any} resources
     */
    constructor(ns, target, duration, finishOrder, resources) {
        super(ns, target, "mock.js", duration, finishOrder, resources, "Mock")
    }

    execute(args) {
        return super.execute([this.duration, ...args]);
    }

    expectedDuration() {
        return this.duration;
    }
}

export class MockExecutionPlanBuilder extends ExecutionPlanBuilder {
    static build(ns, target, hackAmount) {
        new Logger(ns, "MockExecutionPlanBuilder").trace("build()");
        let resourceRequirements = MockExecutionPlanBuilder.getResourceRequirements(ns);
        let plan = new ExecutionPlan(ns, resourceRequirements);
        plan.tasks.push(new MockTask(ns, target, 1000, 0, resourceRequirements.Mock));
        plan.tasks.push(new MockTask(ns, target, 6000, 1, resourceRequirements.Mock));
        plan.tasks.push(new MockTask(ns, target, 4000, 2, resourceRequirements.Mock));
        plan.tasks.push(new MockTask(ns, target, 6000, 3, resourceRequirements.Mock));
        plan.compile();
        return plan;
    }

    /**
     * @param {NS} ns
     */
    static getResourceRequirements(ns) {
        new Logger(ns, "MockExecutionPlanBuilder").trace("getResourceRequirements()");
        return {
            Mock: {
                Threads: 1,
                Ram: ns.getScriptRam("mock.js")
            }
        };
    }
}
import { BatchRunner } from "./batchRunner";
import { ExecutionPlanBuilder, ExecutionPlan } from "./executionPlan";
import { Task } from "./task";

import { Logger } from "./logger";

/** @param {NS} ns */
export async function main(ns) {
    ns.tail();
    const [maxBatches] = ns.args
    let logger = new Logger(ns, "batchRunnerService");
    logger.disableNSLogs();
    logger.info("started.")
    logger.debug(`main(): args=${ns.args}`)
    try {
        await new MockBatchRunner(ns, maxBatches).run();
    } catch (e) {
        logger.error(`Unhandled exception occurred:\n${e.stack}`)
    }
}

class MockBatchRunner extends BatchRunner {
    constructor(ns, maxBatches) {
        let workers = {
            Mock: []
        }
        for (let i = 0; i < maxBatches*4; i++) {
            workers.Mock.push("home")
        }
        
        super(ns, "home", maxBatches, workers, MockExecutionPlanBuilder);
        this.logger.debug(`workers=${JSON.stringify(workers)}`)
    }

    async reset() {
        this.logger.debug("reset()")
        this.batches.forEach((x) => {
            x.cancel();
            this.releaseWorkers(x);
        });
        this.batches = [];
        this.needsReset = false;
        this.lastBatchEndTime = 0;
        this.portHandle.clear();
    }
}

export class MockTask extends Task {
    /** 
     * @param {NS} ns
     * @param {String} target
     * @param {Number} finishOrder 
     * @param {any} resources
     */
    constructor(ns, duration, finishOrder, resources) {
        super(ns, "home", "mock.js", duration, finishOrder, resources, "Mock")
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
        plan.tasks.push(new MockTask(ns, 10000, 0, resourceRequirements.Mock));
        plan.tasks.push(new MockTask(ns, 60000, 1, resourceRequirements.Mock));
        plan.tasks.push(new MockTask(ns, 40000, 2, resourceRequirements.Mock));
        plan.tasks.push(new MockTask(ns, 60000, 3, resourceRequirements.Mock));
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
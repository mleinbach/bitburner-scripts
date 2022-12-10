import { Scheduler } from "./scheduler";
import { MockExecutionPlanBuilder } from "./executionPlan";
import { Logger } from "./logger";

/** @param {NS} ns */
export async function main(ns) {
    let logger = new Logger(ns, "schedulerService");
    logger.disableNSLogs();
    if (ns.args[0] === "tail") {
        ns.tail();
    }
    logger.info("Scheduler running.")
    await new Scheduler(ns, MockExecutionPlanBuilder).run();
    try {
        logger.info("Scheduler running.")
        await new Scheduler(ns, MockExecutionPlanBuilder).run();
    } catch (e) {
        logger.error(`Unhandled exception occurred:\n${e.stack}`)
    }
}
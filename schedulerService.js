import { Scheduler } from "./scheduler";
import { MockExecutionPlanBuilder, HWGWExecutionPlanBuilder } from "./executionPlan";
import { Logger } from "./logger";

/** @param {NS} ns */
export async function main(ns) {
    let logger = new Logger(ns, "schedulerService");
    logger.disableNSLogs();
    if (ns.args[0] === "tail") {
        ns.tail();
    }
    try {
        logger.info("Scheduler running.")
        await new Scheduler(ns, HWGWExecutionPlanBuilder).run();
    } catch (e) {
        logger.error(`Unhandled exception occurred:\n${e.stack}`)
    }
}
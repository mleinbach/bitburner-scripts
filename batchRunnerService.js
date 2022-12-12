import { BatchRunner } from "./batchRunner";
import { HWGWExecutionPlanBuilder, MockExecutionPlanBuilder } from "./executionPlan";
import { Logger } from "./logger";

/** @param {NS} ns */
export async function main(ns) {
    let logger = new Logger(ns, "batchRunnerService");
    logger.disableNSLogs();
    logger.info("started.")
    logger.debug(`main(): args=${ns.args}`)
    try {
        let id = ns.args[0]
        let target = ns.args[1];
        let maxBatches = ns.args[2];
        let workers = JSON.parse(ns.args[3]);
        let hackAmount = ns.args[4];
        await new BatchRunner(ns, target, maxBatches, workers, hackAmount, HWGWExecutionPlanBuilder).run();
    } catch (e) {
        logger.error(`Unhandled exception occurred:\n${e.stack}`)
    }
}
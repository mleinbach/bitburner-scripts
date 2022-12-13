import { BatchRunner } from "./batchRunner";
import { HWGWExecutionPlanBuilder } from "./executionPlan";
import { Logger } from "./logger";

/** @param {NS} ns */
export async function main(ns) {
    const [id, target, maxBatches, workersStr, hackAmount] = ns.args;
    let logger = new Logger(ns, "batchRunnerService");
    logger.disableNSLogs();
    logger.info("started.")
    logger.debug(`main(): args=${ns.args}`)
    try {
        let workers = JSON.parse(workersStr);
        await new BatchRunner(ns, target, maxBatches, workers, hackAmount, HWGWExecutionPlanBuilder).run();
    } catch (e) {
        logger.error(`Unhandled exception occurred:\n${e.stack}`)
    }
}
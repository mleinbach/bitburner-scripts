import { Scheduler } from "./scheduler";
import { BatchRunner } from "./batchRunner";
import { Logger } from "./logger";

/** @param {NS} ns */
export async function main(ns) {
    let logger = new Logger(ns, "schedulerService");
    logger.disableNSLogs();
    let [tail = null, ] = ns.args;

    if (tail !== null) {
        ns.tail();
    }

    try {
        logger.info("Scheduler running.")
        await new Scheduler(ns, BatchRunner).run();
    } catch (e) {
        logger.error(`Unhandled exception occurred:\n${e.stack}`)
    }
}
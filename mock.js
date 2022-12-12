import { Logger } from "./logger";

/** @param {NS} ns */
export async function main(ns) {
    const logger = new Logger(ns, "mock.js")
    const [id, target, duration, delay, batchId, port=null] = ns.args
    const startTime = Date.now();
    await ns.sleep(delay);
    await ns.sleep(duration);
    const endTime = Date.now();

    if (port !== null) {
        logger.debug(`writing to port: ${port}`)
        ns.tryWritePort(port, JSON.stringify({id: id, batchId: batchId, startTime: startTime, endTime: endTime}));
    }
}
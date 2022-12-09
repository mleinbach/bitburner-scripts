import { BatchRunner } from "./batchRunner";

/** @param {NS} ns */
export async function main(ns) {
    let id = ns.args[0]
    let target = ns.args[1];
    let maxBatches = ns.args[2];
    let workers = JSON.parse(ns.args[3]);
    await new BatchRunner(ns, target, maxBatches, workers).run();
}
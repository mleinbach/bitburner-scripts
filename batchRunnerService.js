import { BatchRunner } from "./batchRunner";
import { HWGWExecutionPlanBuilder } from "./executionPlan";

/** @param {NS} ns */
export async function main(ns) {
    let id = ns.args[0]
    let target = ns.args[1];
    let maxBatches = ns.args[2];
    let workers = JSON.parse(ns.args[3]);
    let hackAmount = ns.args[4];
    await new BatchRunner(ns, target, maxBatches, workers, hackAmount, HWGWExecutionPlanBuilder).run();
}
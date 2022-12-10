import { BatchRunner } from "./batchRunner";
import { MockExecutionPlanBuilder } from "./executionPlan";

/** @param {NS} ns */
export async function main(ns) {
    let target = "n00dles";
    let maxBatches = 2;
    let workers = {"Mock": ["home", "home", "home", "home"]};
    let hackAmount = 0.10;
    let executionPlanBuilder = MockExecutionPlanBuilder;
    let runner = new BatchRunner(ns, target, maxBatches, workers, hackAmount, executionPlanBuilder);
    await runner.run();
}
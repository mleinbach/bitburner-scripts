import { BatchRunner } from "./batchRunner";
import { MockExecutionPlanBuilder } from "./executionPlan";

/** @param {NS} ns */
export async function main(ns) {
    let target = "home";
    let maxBatches = 20;

    let workers = {"Mock": []};
    for (let i = 0; i < maxBatches; i++) {
        workers.Mock.push(...["home", "home", "home", "home"]);
    }
    let hackAmount = 0.10;
    let executionPlanBuilder = MockExecutionPlanBuilder;
    let runner = new BatchRunner(ns, target, maxBatches, workers, hackAmount, executionPlanBuilder);
    await runner.run();
}
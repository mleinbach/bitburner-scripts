import { MockExecutionPlanBuilder } from "./executionPlan";

/** @param {NS} ns */
export async function main(ns) {
    let a = MockExecutionPlanBuilder;
    let executionPlan = a.build(ns, "home", 0.10);
    ns.tprint(JSON.stringify(executionPlan))
}
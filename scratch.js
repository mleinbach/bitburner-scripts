import { timing } from "./config";
import { MockTask } from "./task";
import { disableNSLogs } from "./utilities";

class A {
    constructor(value) {
        this.value = value;
        this.otherValue = null;
    }

    duplicate() {
        var dupe = new A(this.value);
        return dupe;
    }

}


/** @param {NS} ns */
export async function main(ns) {
    let a = new A(1);
    let b = a.duplicate();
    b.value = 2;
    ns.tprint(`a.value = ${a.value}; b.value = ${b.value}`)
}

export async function asdf(ns) {
    disableNSLogs(ns);
    var executePlan = [
        {Task: new MockTask(ns, 5000), Order: 0, FinishTime:NaN},
        {Task: new MockTask(ns, 10000), Order: 1, FinishTime:NaN},
        {Task: new MockTask(ns, 7000), Order: 2, FinishTime:NaN},
        {Task: new MockTask(ns, 10000), Order: 3, FinishTime:NaN}
    ]

    executePlan.forEach((t) => {
        t.Duration=t.Task.expectedDuration()
    });

    var longestTask = executePlan.reduce((x, y) => {
        if (y.Duration > x.Duration) {
            return y
        } else if (y.Duration < x.Duration){
            return x
        }
        else {
            if (x.Order <= y.Order) {
                return x
            }
            else{
                return y
            }
        }
    })

    for (var task of executePlan) {
        var delay = (
            (longestTask.Duration - task.Duration)
            + (task.Order * timing.batchBetweenScriptDelay))
        // optionally: - (longest.Order * timing.batchBetweenScriptDelay)
        task.Delay = delay;
        task.TotalDuration = delay + task.Duration;
    }

    executePlan.sort((x, y) => {
        var res = x.Delay - y.Delay;
        if (res == 0){
            res = x.Order - y.Order;
        }
        return res;
    })

    executePlan.forEach((x) => x.Task.execute(1, x.Delay));
    while(true){
        var nRunning = 0;
        for (var task of executePlan){
            if (task.Task.isRunning()){
                nRunning++;
            } else if (isNaN(task.FinishTime)) {
                task.FinishTime = Date.now();
            }
        }
        if (nRunning == 0){
            break;
        }
        await ns.sleep(100);
    }

    executePlan.sort((x, y) => x.FinishTime - y.FinishTime);
    var success = executePlan.every((x, ix) => x.Order == ix);
    var finishTime = executePlan[executePlan.length-1].FinishTime;

    if (success) {
        ns.print(`SUCCESS - Finished at ${finishTime}`)
    }
    else {
        ns.print("FAIL")
    }
}
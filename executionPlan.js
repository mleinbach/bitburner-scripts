import { HackTask, GrowTask, WeakenTask, MockTask } from "./task"

export class MockExecutionPlan {
    constructor(ns) {
        this.ns = ns;
        this.tasks = this.#createTasks();
    }

    #createTasks() {
        var task1 = new HackTask(this.ns, 5000);
        var task2 = new GrowTask(this.ns, 10000);
        var task3 = new WeakenTask(this.ns, 7000);
        var task4 = new WeakenTask(this.ns, 10000);

        var plan = [
            {
                Name: "Task1",
                Task: new MockTask(this.ns, 5000),
                TaskDuration: 5000,
                FinishOrder: 0,
                StartOrder: null,
                Delay: null,
                TotalDuration: null,
                Worker: null,
                Resources: this.resourceRequirements.Hack
            },
            {
                Name: "Task2",
                Task: weakenTask1,
                Duration: weakenTask1.expectedDuration(),
                FinishOrder: 1,
                StartOrder: null,
                Delay: null,
                TotalDuration: null,
                Worker: null,
                Resources: this.resourceRequirements.Weaken
            },
            {
                Name: "Task3",
                Task: growTask,
                Duration: growTask.expectedDuration(),
                FinishOrder: 2,
                StartOrder: null,
                Delay: null,
                TotalDuration: null,
                Worker: null,
                Resources: this.resourceRequirements.Grow
            },
            {
                Name: "Task4",
                Task: weakenTask2,
                Duration: weakenTask2.expectedDuration(),
                FinishOrder: 3,
                StartOrder: null,
                Delay: null,
                TotalDuration: null,
                Worker: null,
                Resources: this.resourceRequirements.Weaken
            }
        ]

        var longestTask = plan.reduce((x, y) => {
            if (y.Duration > x.Duration) {
                return y
            } else if (y.Duration < x.Duration) {
                return x
            }
            else {
                if (x.FinishOrder <= y.FinishOrder) {
                    return x
                }
                else {
                    return y
                }
            }
        })

        for (var task of plan) {
            var delay = (
                (longestTask.Duration - task.Duration)
                + (task.FinishOrder * timing.batchBetweenScriptDelay))
            // optionally: - (longest.FinishOrder * timing.batchBetweenScriptDelay)
            task.Delay = delay;
            task.TotalDuration = delay + task.Duration;
        }

        plan.sort((x, y) => {
            var res = x.Delay - y.Delay;
            if (res == 0) {
                res = x.FinishOrder - y.FinishOrder;
            }
            return res;
        })

        plan.forEach((x, ix) => x.StartOrder = ix);

        return plan;
    }


}

export class HWGWExecutionPlan {
    constructor(ns, resourceRequirements) {
        this.ns = ns;
        this.resourceRequirements = resourceRequirements;
        this.tasks = this.#createTasks();
    }

    #createTasks() {
        var hackTask = new HackTask(this.ns, this.target);
        var growTask = new GrowTask(this.ns, this.target);
        var weakenTask1 = new WeakenTask(this.ns, this.target);
        var weakenTask2 = new WeakenTask(this.ns, this.target);

        var plan = [
            {
                Name: "Hack",
                Task: hackTask,
                TaskDuration: hackTask.expectedDuration(),
                FinishOrder: 0,
                StartOrder: null,
                Delay: null,
                TotalDuration: null,
                Worker: null,
                Resources: this.resourceRequirements.Hack
            },
            {
                Name: "Weaken1",
                Task: weakenTask1,
                Duration: weakenTask1.expectedDuration(),
                FinishOrder: 1,
                StartOrder: null,
                Delay: null,
                TotalDuration: null,
                Worker: null,
                Resources: this.resourceRequirements.Weaken
            },
            {
                Name: "Grow",
                Task: growTask,
                Duration: growTask.expectedDuration(),
                FinishOrder: 2,
                StartOrder: null,
                Delay: null,
                TotalDuration: null,
                Worker: null,
                Resources: this.resourceRequirements.Grow
            },
            {
                Name: "Weaken2",
                Task: weakenTask2,
                Duration: weakenTask2.expectedDuration(),
                FinishOrder: 3,
                StartOrder: null,
                Delay: null,
                TotalDuration: null,
                Worker: null,
                Resources: this.resourceRequirements.Weaken
            }
        ]

        var longestTask = plan.reduce((x, y) => {
            if (y.Duration > x.Duration) {
                return y
            } else if (y.Duration < x.Duration) {
                return x
            }
            else {
                if (x.FinishOrder <= y.FinishOrder) {
                    return x
                }
                else {
                    return y
                }
            }
        })

        for (var task of plan) {
            var delay = (
                (longestTask.Duration - task.Duration)
                + (task.FinishOrder * timing.batchBetweenScriptDelay))
            // optionally: - (longest.FinishOrder * timing.batchBetweenScriptDelay)
            task.Delay = delay;
            task.TotalDuration = delay + task.Duration;
        }

        plan.sort((x, y) => {
            var res = x.Delay - y.Delay;
            if (res == 0) {
                res = x.FinishOrder - y.FinishOrder;
            }
            return res;
        })

        plan.forEach((x, ix) => x.StartOrder = ix);

        return plan;
    }
}


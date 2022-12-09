import { HackTask, GrowTask, WeakenTask, MockTask } from "./task"

export class MockExecutionPlan {
    /** @param {NS} ns */
    constructor(ns, resourceRequirements) {
        this.ns = ns;
        this.resourceRequirements = resourceRequirements;
        this.tasks = this.#createTasks();
    }

    #createTasks() {
        var task1 = new MockTask(this.ns, 5000);
        var task2 = new MockTask(this.ns, 10000);
        var task3 = new MockTask(this.ns, 7000);
        var task4 = new MockTask(this.ns, 10000);

        var plan = [
            {
                Name: "Task1",
                Task: task1,
                TaskDuration: task1.expectedDuration(),
                FinishOrder: 0,
                StartOrder: null,
                Delay: null,
                TotalDuration: null,
                Worker: null,
                Resources: this.resourceRequirements.Mock
            },
            {
                Name: "Task2",
                Task: task2,
                Duration: task2.expectedDuration(),
                FinishOrder: 1,
                StartOrder: null,
                Delay: null,
                TotalDuration: null,
                Worker: null,
                Resources: this.resourceRequirements.Mock
            },
            {
                Name: "Task3",
                Task: task3,
                Duration: task3.expectedDuration(),
                FinishOrder: 2,
                StartOrder: null,
                Delay: null,
                TotalDuration: null,
                Worker: null,
                Resources: this.resourceRequirements.Mock
            },
            {
                Name: "Task4",
                Task: task4,
                Duration: task4.expectedDuration(),
                FinishOrder: 3,
                StartOrder: null,
                Delay: null,
                TotalDuration: null,
                Worker: null,
                Resources: this.resourceRequirements.Mock
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

    /** @returns {Number} */
    getDuration() {
        return this.tasks.map((x) => x.TotalDuration).reduce((x, y) => (x - y) > 0 ? x : y);
    }
}

export class HWGWExecutionPlan {
    /** @param {NS} ns */
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

    /** @returns {Number} */
    getDuration() {
        return this.tasks.map((x) => x.TotalDuration).reduce((x, y) => (x - y) > 0 ? x : y);
    }
}


import { hgwScripts } from "./constants"
import { NSProcess } from "./nsProcess"

export class Task extends NSProcess {
    /** 
     * @param {NS} ns
     * @param {String} target
     * @param {Number} duration
     * @param {Number} finishOrder
     */
    constructor(ns, target, script, duration, finishOrder, resources, name) {
        super(ns, target, script)
        this.duration = duration;
        this.finishOrder = finishOrder;
        this.resources = resources;
        this.name = name
        this.startOrder = null;
        this.delay = 0;
        this.worker = null;
    }

    totalDuration() {
        this.duration + this.delay;
    }
}

export class MockTask extends Task {
    /** 
     * @param {NS} ns
     * @param {String} target
     * @param {Number} finishOrder 
     * @param {any} resources
     */
    constructor(ns, duration, finishOrder, resources) {
        super(ns, "home", "mock.js", duration, finishOrder, resources, "Mock")
    }

    expectedDuration() {
        return this.duration;
    }
}

export class HackTask extends Task {
    /** 
     * @param {NS} ns
     * @param {String} target
     * @param {Number} finishOrder 
     * @param {any} resources
     */
    constructor(ns, target, finishOrder, resources) {
        super(ns, target, hgwScripts.Hack, ns.getHackTime(target), finishOrder, "Hack");
    }

    expectedDuration() {
        return this.ns.getHackTime(this.target);
    }
}

export class GrowTask extends Task {
    /** 
     * @param {NS} ns
     * @param {String} target
     * @param {Number} finishOrder 
     * @param {any} resources
     */
    constructor(ns, target, finishOrder) {
        super(ns, target, hgwScripts.Grow, ns.getGrowTime(target), finishOrder, "Grow")
    }

    expectedDuration() {
        return this.ns.getGrowTime(this.target);
    }
}

export class WeakenTask extends Task {
    /** 
     * @param {NS} ns
     * @param {String} target
     * @param {Number} finishOrder 
     * @param {any} resources
     */
    constructor(ns, target, finishOrder) {
        super(ns, target, hgwScripts.Weaken, ns.getWeakenTime(target), finishOrder, "Weaken")
    }

    expectedDuration() {
        return this.ns.getWeakenTime(this.target);
    }
}
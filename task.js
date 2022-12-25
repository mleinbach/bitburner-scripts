import { HGWScripts, TaskStatus, HGWOperations } from "./constants"
import { NSProcess } from "./nsProcess"

export class Task extends NSProcess {
    /** 
     * @param {NS} ns
     * @param {String} target
     * @param {Number} duration
     * @param {Number} finishOrder
     */
    constructor(ns, target, script, finishOrder, resources, name) {
        super(ns, target, script)
        this.duration = resources.Duration;
        this.finishOrder = finishOrder;
        this.resources = resources;
        this.name = name
        this.startOrder = null;
        this.delay = 0;
        /** @type {String} */
        this.worker = null;
        this.expectedEndTime = null;
        this.status = TaskStatus.NOT_STARTED;
        this.executeSecurity = null;
    }

    totalDuration() {
        return this.duration + this.delay;
    }

    execute(args) {
        super.execute(this.worker, this.resources.Threads, args);
        this.expectedEndTime = this.startTime + this.totalDuration();
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
        super(ns, target, HGWScripts.HACK, finishOrder, resources, HGWOperations.HACK);
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
    constructor(ns, target, finishOrder, resources) {
        super(ns, target, HGWScripts.GROW, finishOrder, resources, HGWOperations.GROW)
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
    constructor(ns, target, finishOrder, resources) {
        super(ns, target, HGWScripts.WEAKEN, finishOrder, resources, HGWOperations.WEAKEN);
    }

    expectedDuration() {
        return this.ns.getWeakenTime(this.target);
    }
}
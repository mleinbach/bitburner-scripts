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
        return this.duration + this.delay;
    }

    execute(args) {
        return super.execute(this.worker, this.resources.Threads, args);
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
        let duration = Math.floor(ns.getHackTime(target));
        //let duration = ns.getHackTime(target);
        super(ns, target, hgwScripts.Hack, duration, finishOrder, resources, "Hack");
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
        let duration = Math.floor(ns.getGrowTime(target));
        //let duration = ns.getGrowTime(target);
        super(ns, target, hgwScripts.Grow, duration, finishOrder, resources, "Grow")
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
        let duration = Math.floor(ns.getWeakenTime(target));
        //let duration = ns.getWeakenTime(target);
        super(ns, target, hgwScripts.Weaken, duration, finishOrder, resources, "Weaken")
    }

    expectedDuration() {
        return this.ns.getWeakenTime(this.target);
    }
}
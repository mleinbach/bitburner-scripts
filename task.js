import { hgwScripts } from "./constants"
import { NSProcess } from "./nsProcess"

export class MockTask extends NSProcess {
    /** 
     * @param {NS} ns
     * @param {Number} duration  
     */
    constructor(ns, duration) {
        super(ns, "home", "mock.js")
        this.duration = duration;
    }

    expectedDuration() {
        return this.duration;
    }
}

export class HackTask extends NSProcess {
    /** @param {NS} ns */
    constructor(ns, target) {
        super(ns, target, hgwScripts.Hack)
    }

    expectedDuration() {
        return this.ns.getHackTime(this.target);
    }
}

export class GrowTask extends NSProcess {
    /** @param {NS} ns */
    constructor(ns, target) {
        super(ns, target, hgwScripts.Grow)
    }

    expectedDuration() {
        return this.ns.getGrowTime(this.target);
    }
}

export class WeakenTask extends NSProcess {
    /** @param {NS} ns */
    constructor(ns, target) {
        super(ns, target, hgwScripts.Weaken)
    }

    expectedDuration() {
        return this.ns.getWeakenTime(this.target);
    }
}
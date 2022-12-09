export class NSProcess {
    static randomId() {
        return Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0');
    }

    /** 
     *  @param {NS} ns
     */
    constructor(ns, target, script) {
        this.ns = ns;
        this.target = target;
        this.script = script;
        this.id = NSProcess.randomId();
        this.pid = null;
        this.startTime = null;;
        this.finishTime = null;
    }

    execute(worker, threads=1, args=[]) {
        if (this.pid === null){
            this.pid = this.ns.exec(this.script, worker, threads, this.id, this.target, ...args);
            if (this.pid <= 0) {
                throw `${this.script}, ${this.worker}`
            }
            this.startTime = Date.now();
        }
        return this;
    }

    cancel() {
        if (this.pid !== null) {
            this.ns.kill(this.pid);
            this.finishTime = Date.now();
        }
    }

    isRunning() {
        if(this.pid > 0 && this.ns.isRunning(this.pid)){
            return true;
        }
        if (this.finishTime === null) {
            this.finishTime = Date.now();
        }
        return false;
    }
}
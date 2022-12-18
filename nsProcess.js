import { Logger } from "./logger"

export class ExecError extends Error {
    constructor(message=null) {
        super(message)
    }
}

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
        this.logger = new Logger(ns, "NSProcess");
        this.logger.disableNSLogs();
        this.pid = null;
        this.startTime = null;
        this.endTime = null;
    }

    execute(worker, threads=1, args=[]) {
        if (this.pid === null){
            this.logger.debug(`${this.script}. ${worker}, ${threads}, ${this.id}, ${this.target} ${JSON.stringify(args)}`)
            //this.ns.enableLog("exec");
            this.pid = this.ns.exec(this.script, worker, threads, this.id, this.target, ...args);
            //this.ns.disableLog("exec");
            if (this.pid <= 0) {
                throw new ExecError(`${this.script}, ${this.worker}`);
            }
            this.startTime = Date.now();
        }
        return this;
    }

    cancel() {
        if (this.pid !== null) {
            this.ns.kill(this.pid);
            this.endTime = Date.now();
        }
    }

    isRunning() {
        if(this.pid > 0 && this.ns.isRunning(this.pid)){
            return true;
        }
        return false;
    }
}
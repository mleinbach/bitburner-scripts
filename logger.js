import { verbosity } from "./config";

class LogLevel {
    static error = "ERROR";
    static warn = "WARN";
    static info = "INFO";
    static debug = "DEBUG";
    static success = "SUCCESS";
    static trace = "TRACE";
}

export class Logger {
    /**
     * @param {NS} ns 
     * @param {String} name 
     */
    constructor(ns, name) {
        this.ns = ns;
        this.name = name;
        this.verbosity = verbosity
    }

    success(msg) {
        this.#log(msg, LogLevel.success);
    }

    error(msg) {
        this.#log(msg, LogLevel.error);
    }

    warn(msg) {
        this.#log(msg, LogLevel.warn);
    }

    info(msg) {

        this.#log(msg, LogLevel.info);
    }

    debug(msg) {
        this.#log(msg, LogLevel.debug);
    }

    trace(msg) {
        this.#log(msg, LogLevel.trace);
    }

    /** @param {NS} ns */
    #log(msg, severity) {
        if (this.#checkVerbosity(severity)) {
            this.ns.print(`[${(new Date()).toISOString()}] [${severity}] [${this.name}] ${msg}`);
        }
    }

    #checkVerbosity(severity) {
        if (severity === LogLevel.trace && this.verbosity >= 5){
            return true
        } else if (severity === LogLevel.debug && this.verbosity >= 4) {
            return true
        } else if (severity === LogLevel.info && this.verbosity >= 3) {
            return true
        } else if (severity === LogLevel.warn && this.verbosity >= 2) {
            return true
        } else if (severity === LogLevel.success && this.verbosity >= 1) {
            return true
        } else if (severity === LogLevel.error && this.verbosity >= 0) {
            return true
        } else {
            return false
        }
    }

    disableNSLogs() {
        this.ns.disableLog("disableLog");
        for (var key in this.ns) {
            if (typeof this.ns[key] === "function") {
                this.ns.disableLog(key);
            }
        }
    }
}
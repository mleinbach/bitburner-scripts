export const securityModifiers = {
    "weaken" : 0.05,
    "hack": 0.002,
    "grow": 0.004
};

export const HGWOperations = {
    HACK: "Hack",
    GROW: "Grow",
    WEAKEN: "Weaken"
}

export const HGWScripts = {
    HACK: "hack.js",
    GROW: "grow.js",
    WEAKEN: "weaken.js",
}

export const TaskStatus = {
    WAITING: "WAITING",
    EXECUTING: "EXECUTING",
    COMPLETED: "COMPLETED",
    CANCELLED: "CANCELLED"
}

export const RunnerStages = {
    INITIALIZING: "INITIALIZING",
    QUEUEING: "QUEUEING",
    RUNNING: "RUNNING",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED"
}

export const EMPTY_PORT = "NULL PORT DATA"
export const ports = {
    BATCH_STATUS: 1
}
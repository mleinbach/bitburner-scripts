export const securityModifiers = {
    "weaken" : 0.05,
    "hack": 0.002,
    "grow": 0.004
};

export const logLevels = {
    "debug": ["DEBUG", 5],
    "info": ["INFO", 4],
    "warn": ["WARN", 3],
    "error": ["ERROR", 2],
    "fatal": ["FATAL", 1]
}

export const hgwOperations = {
    Hack: "Hack",
    Grow: "Grow",
    WeakenGrow: "WeakenGrow",
    WeakenHack: "WeakenHack"
}

export const hgwScripts = {
    Hack: "hack.js",
    Grow: "grow.js",
    Weaken: "weaken.js",
}

export const ServerBaseGrowthRate=1.03;
export const ServerMaxGrowthRate=1.0035;
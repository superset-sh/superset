export interface Env {
    type: "local" | "cloud";
}

export interface Process {
    id: string;
    title: string;
    type: "agent" | "terminal";
}

export interface Agent extends Process {
    agentType: "codex" | "claude";
}

export interface Terminal extends Process {
    // placeholder
}

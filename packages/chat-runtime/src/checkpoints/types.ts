export type CheckpointTarget = {
	cwd: string;
	sessionId: string;
	itemId: string;
};

export type RewindFilesResult = {
	files: "restored" | "missing" | "unsupported";
};

/** Snapshots of the working tree, taken just before each prompt reaches the agent. */
export type ChatCheckpoints = {
	capture(target: CheckpointTarget): Promise<void>;
	restore(target: CheckpointTarget): Promise<"restored" | "missing">;
	/** Lets a session opened by a rewind restore the checkpoints of the one it came from. */
	fork?(input: {
		cwd: string;
		fromSessionId: string;
		toSessionId: string;
	}): Promise<void>;
};

import type {
	Decision,
	Delta,
	DiscoverSessionsResult,
	Item,
	SessionState,
	Turn,
	UserContent,
} from "@superset/chat/protocol";

export type AdapterEvent =
	| { type: "item"; item: Item; turnId: string }
	| { type: "delta"; delta: Delta }
	| { type: "turn"; turn: Turn }
	| { type: "session"; session: Partial<SessionState> };

export type HarnessStartOptions = {
	cwd: string;
	modeId?: string;
	modelId?: string;
	/** `quiet` loads the agent's history without replaying it as items. */
	resume?: { harnessSessionId: string; quiet?: boolean };
};

/** Asks a harness for its own history. Must not open a session. */
export type DiscoverNativeSessionsInput = {
	cwd: string;
	cursor?: string;
};

export interface HarnessAdapter {
	start(options: HarnessStartOptions): AsyncIterable<AdapterEvent>;
	prompt(content: UserContent[]): void;
	cancelTurn(): void;
	canSteer?(): boolean;
	/** Resolves false when the agent did not accept the prompt, so the caller queues it. */
	steer?(content: UserContent[]): Promise<boolean>;
	respondToApproval(approvalId: string, decision: Decision): void;
	setMode(modeId: string): void;
	setConfigOption?(configId: string, value: string): void;
	/**
	 * Branch this session, returning the harness id of the copy. Absent, or
	 * null, when the harness cannot: the agent has to advertise it.
	 */
	/** With `upToMessageId`, keeps the conversation only through that message, or returns null when it cannot. */
	fork?(cut?: { upToMessageId: string }): Promise<string | null>;
	stopBackgroundTask?(taskId: string): Promise<boolean>;
	steerSubagent?(taskId: string, content: UserContent[]): Promise<boolean>;
	backgroundSubagent?(taskId: string): Promise<boolean>;
	/**
	 * Lists the harness's own sessions. Absent when this harness has no native
	 * history. `supported: false` means the process answered but cannot list.
	 */
	discoverSessions?(
		input: DiscoverNativeSessionsInput,
	): Promise<DiscoverSessionsResult>;
	dispose(): Promise<void>;
}

import type {
	Decision,
	Delta,
	Item,
	SessionState,
	Turn,
	UserContent,
} from "@superset/chat/protocol";

export type AdapterEvent =
	| { kind: "item"; item: Item; turnId: string }
	| { kind: "delta"; delta: Delta }
	| { kind: "turn"; turn: Turn }
	| { kind: "session"; session: Partial<SessionState> };

export type HarnessStartOptions = {
	cwd: string;
	modeId?: string;
	modelId?: string;
	resume?: { harnessSessionId: string };
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
	fork?(): Promise<string | null>;
	stopBackgroundTask?(taskId: string): Promise<boolean>;
	dispose(): Promise<void>;
}

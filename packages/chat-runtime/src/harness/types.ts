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
	respondToApproval(approvalId: string, decision: Decision): void;
	setMode(modeId: string): void;
	dispose(): Promise<void>;
}

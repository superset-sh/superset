import type {
	ApprovalRequest,
	Decision,
	ToolCall,
	Turn,
	UserContent,
} from "@superset/chat/protocol";
import { EventQueue } from "../eventQueue";
import type {
	AdapterEvent,
	HarnessAdapter,
	HarnessStartOptions,
} from "../types";

export type ScriptedEvent = AdapterEvent & { delayMs?: number };

export type FakeHarnessScript = {
	start?: ScriptedEvent[];
	turns: ScriptedEvent[][];
};

type PendingApproval = {
	item: ApprovalRequest;
	turnId: string;
	release: () => void;
};

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripDelay(scripted: ScriptedEvent): AdapterEvent {
	switch (scripted.kind) {
		case "item":
			return { kind: "item", item: scripted.item, turnId: scripted.turnId };
		case "delta":
			return { kind: "delta", delta: scripted.delta };
		case "turn":
			return { kind: "turn", turn: scripted.turn };
		case "session":
			return { kind: "session", session: scripted.session };
	}
}

function asPendingApproval(event: AdapterEvent): ApprovalRequest | null {
	if (event.kind !== "item") return null;
	const item = event.item;
	if (item.kind !== "approval_request") return null;
	if (!("status" in item) || item.status !== "pending") return null;
	return item as ApprovalRequest;
}

function asRunningToolCall(event: AdapterEvent): ToolCall | null {
	if (event.kind !== "item") return null;
	const item = event.item;
	if (item.kind !== "tool_call") return null;
	if (!("status" in item) || item.status !== "running") return null;
	return item as ToolCall;
}

export class FakeHarness implements HarnessAdapter {
	private readonly queue = new EventQueue();
	private readonly pendingApprovals = new Map<string, PendingApproval>();
	private readonly runningToolCalls = new Map<
		string,
		{ item: ToolCall; turnId: string }
	>();
	private tail: Promise<void> = Promise.resolve();
	private currentTurn: Turn | null = null;
	private canceled = false;
	private nextTurnIndex = 0;
	private disposed = false;

	constructor(private readonly script: FakeHarnessScript) {}

	start(_options: HarnessStartOptions): AsyncIterable<AdapterEvent> {
		this.enqueue(this.script.start ?? []);
		return this.queue.iterable();
	}

	prompt(_content: UserContent[]): void {
		const turn = this.script.turns[this.nextTurnIndex];
		if (!turn) throw new Error("fake harness script exhausted");
		this.nextTurnIndex += 1;
		this.enqueue(turn);
	}

	cancelTurn(): void {
		this.canceled = true;
		const canceledAtMs = Date.now();

		for (const [approvalId, pending] of [...this.pendingApprovals]) {
			this.pendingApprovals.delete(approvalId);
			const stale: ApprovalRequest = {
				...pending.item,
				status: "stale",
				completedAtMs: canceledAtMs,
			};
			this.emit({ kind: "item", item: stale, turnId: pending.turnId });
			pending.release();
		}

		for (const [itemId, running] of [...this.runningToolCalls]) {
			this.runningToolCalls.delete(itemId);
			const canceled: ToolCall = {
				...running.item,
				status: "canceled",
				completedAtMs: canceledAtMs,
			};
			this.emit({ kind: "item", item: canceled, turnId: running.turnId });
		}

		const turn = this.currentTurn;
		if (turn?.status === "running") {
			this.emit({
				kind: "turn",
				turn: { ...turn, status: "interrupted", completedAtMs: canceledAtMs },
			});
		}
	}

	respondToApproval(approvalId: string, decision: Decision): void {
		const pending = this.pendingApprovals.get(approvalId);
		if (!pending) throw new Error(`unknown approval ${approvalId}`);
		this.pendingApprovals.delete(approvalId);
		const answered: ApprovalRequest = {
			...pending.item,
			status: "answered",
			decision,
			completedAtMs: Date.now(),
		};
		this.emit({ kind: "item", item: answered, turnId: pending.turnId });
		pending.release();
	}

	setMode(modeId: string): void {
		this.emit({ kind: "session", session: { modeId } });
	}

	async dispose(): Promise<void> {
		this.disposed = true;
		for (const [approvalId, pending] of [...this.pendingApprovals]) {
			this.pendingApprovals.delete(approvalId);
			pending.release();
		}
		await this.tail;
		this.queue.close();
	}

	private enqueue(events: readonly ScriptedEvent[]): void {
		this.tail = this.tail.then(() => this.run(events));
	}

	private async run(events: readonly ScriptedEvent[]): Promise<void> {
		this.canceled = false;
		for (const scripted of events) {
			if (this.canceled || this.disposed) return;
			if (scripted.delayMs !== undefined) await sleep(scripted.delayMs);
			if (this.canceled || this.disposed) return;

			const event = stripDelay(scripted);
			this.emit(event);

			const approval = asPendingApproval(event);
			if (!approval) continue;
			const turnId = event.kind === "item" ? event.turnId : "";
			await new Promise<void>((release) => {
				this.pendingApprovals.set(approval.id, {
					item: approval,
					turnId,
					release,
				});
			});
		}
	}

	private emit(event: AdapterEvent): void {
		if (event.kind === "turn") this.currentTurn = event.turn;
		if (event.kind === "item" && event.item.kind === "tool_call") {
			const running = asRunningToolCall(event);
			if (running) {
				this.runningToolCalls.set(running.id, {
					item: running,
					turnId: event.turnId,
				});
			} else {
				this.runningToolCalls.delete(event.item.id);
			}
		}
		this.queue.push(event);
	}
}

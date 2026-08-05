import { randomUUID } from "node:crypto";
import type {
	SDKUserMessage,
	query as sdkQuery,
} from "@anthropic-ai/claude-agent-sdk";
import type {
	ApprovalRequest,
	Decision,
	UserContent,
} from "@superset/chat/protocol";
import type {
	AdapterEvent,
	HarnessAdapter,
	HarnessStartOptions,
} from "../../types";
import { ClaudeTranslator } from "../translateStream";

type SdkParams = Parameters<typeof sdkQuery>[0];
type SdkOptions = NonNullable<SdkParams["options"]>;

/**
 * Input positions are the SDK's own types: widening them (a bare `string`
 * permissionMode, an `AsyncIterable<unknown>` prompt) type-checks against the
 * real `query` only through a cast, and the cast is what hid the mismatch.
 */
export type ClaudeQueryOptions = Pick<
	SdkOptions,
	| "abortController"
	| "canUseTool"
	| "cwd"
	| "includePartialMessages"
	| "model"
	| "permissionMode"
	| "resume"
	| "settingSources"
>;

type PermissionResult = Awaited<
	ReturnType<NonNullable<SdkOptions["canUseTool"]>>
>;

export type ClaudeSession = AsyncIterable<unknown> & {
	interrupt?: () => Promise<void>;
};

export type ClaudeQuery = (params: {
	prompt: SdkParams["prompt"];
	options: ClaudeQueryOptions;
}) => ClaudeSession;

export type ClaudeAdapterOptions = {
	query: ClaudeQuery;
	now?: () => number;
	mintId?: () => string;
};

type PendingApproval = {
	toolUseId: string;
	input: Record<string, unknown>;
	settle: (result: PermissionResult) => void;
};

class EventQueue {
	private readonly buffered: AdapterEvent[] = [];
	private waiting: ((result: IteratorResult<AdapterEvent>) => void) | null =
		null;
	private closed = false;

	push(event: AdapterEvent): void {
		if (this.closed) return;
		const waiting = this.waiting;
		if (waiting) {
			this.waiting = null;
			waiting({ value: event, done: false });
			return;
		}
		this.buffered.push(event);
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		const waiting = this.waiting;
		if (waiting) {
			this.waiting = null;
			waiting({ value: undefined, done: true });
		}
	}

	next(): Promise<IteratorResult<AdapterEvent>> {
		const buffered = this.buffered.shift();
		if (buffered) return Promise.resolve({ value: buffered, done: false });
		if (this.closed) return Promise.resolve({ value: undefined, done: true });
		return new Promise((resolve) => {
			this.waiting = resolve;
		});
	}
}

class PromptQueue {
	private readonly buffered: SDKUserMessage[] = [];
	private waiting: ((result: IteratorResult<SDKUserMessage>) => void) | null =
		null;
	private closed = false;

	push(message: SDKUserMessage): void {
		const waiting = this.waiting;
		if (waiting) {
			this.waiting = null;
			waiting({ value: message, done: false });
			return;
		}
		this.buffered.push(message);
	}

	close(): void {
		this.closed = true;
		const waiting = this.waiting;
		if (waiting) {
			this.waiting = null;
			waiting({ value: undefined, done: true });
		}
	}

	async *stream(): AsyncIterable<SDKUserMessage> {
		while (true) {
			const buffered = this.buffered.shift();
			if (buffered) {
				yield buffered;
				continue;
			}
			if (this.closed) return;
			const next = await new Promise<IteratorResult<SDKUserMessage>>(
				(resolve) => {
					this.waiting = resolve;
				},
			);
			if (next.done) return;
			yield next.value;
		}
	}
}

function promptText(content: UserContent[]): string {
	return content
		.map((part) => (part.type === "text" ? part.text : `[${part.name}]`))
		.join("\n");
}

export class ClaudeAdapter implements HarnessAdapter {
	private readonly events = new EventQueue();
	private readonly prompts = new PromptQueue();
	private readonly approvals = new Map<string, PendingApproval>();
	private readonly abortController = new AbortController();
	private translator: ClaudeTranslator | null = null;
	private session: ClaudeSession | null = null;
	private pump: Promise<void> | null = null;
	private disposed = false;

	constructor(private readonly options: ClaudeAdapterOptions) {}

	start(startOptions: HarnessStartOptions): AsyncIterable<AdapterEvent> {
		const translator = new ClaudeTranslator({
			cwd: startOptions.cwd,
			now: this.options.now,
			mintId: this.options.mintId,
		});
		this.translator = translator;

		const stream = this.options.query({
			prompt: this.prompts.stream(),
			options: {
				cwd: startOptions.cwd,
				model: startOptions.modelId,
				includePartialMessages: true,
				settingSources: [],
				permissionMode: "default",
				abortController: this.abortController,
				resume: startOptions.resume?.harnessSessionId,
				canUseTool: (_toolName, input, { toolUseID }) =>
					this.requestApproval(input, toolUseID),
			},
		});

		this.session = stream;
		this.pump = this.run(stream, translator);
		const events = this.events;
		return {
			[Symbol.asyncIterator](): AsyncIterator<AdapterEvent> {
				return { next: () => events.next() };
			},
		};
	}

	prompt(content: UserContent[]): void {
		this.prompts.push({
			type: "user",
			message: { role: "user", content: promptText(content) },
			parent_tool_use_id: null,
		});
	}

	cancelTurn(): void {
		const interrupt = this.session?.interrupt;
		if (!interrupt) {
			this.abortController.abort();
			return;
		}
		this.translator?.markInterrupted("Turn canceled by user");
		void interrupt.call(this.session).catch(() => {
			this.abortController.abort();
		});
	}

	respondToApproval(approvalId: string, decision: Decision): void {
		const pending = this.approvals.get(approvalId);
		if (!pending) return;
		this.approvals.delete(approvalId);

		if (decision.type === "accept" || decision.type === "accept_for_session") {
			pending.settle({ behavior: "allow", updatedInput: pending.input });
		} else {
			this.translator?.markDeclined(pending.toolUseId);
			pending.settle({
				behavior: "deny",
				message: "User declined this tool call.",
				...(decision.type === "cancel" ? { interrupt: true } : {}),
			});
		}

		this.emitApproval(approvalId, pending.toolUseId, "answered", decision);
		if (decision.type === "cancel") this.cancelTurn();
	}

	setMode(modeId: string): void {
		this.events.push({ kind: "session", session: { modeId } });
	}

	async dispose(): Promise<void> {
		this.disposed = true;
		for (const [approvalId, pending] of [...this.approvals]) {
			this.approvals.delete(approvalId);
			pending.settle({ behavior: "deny", message: "Session disposed." });
		}
		this.abortController.abort();
		this.prompts.close();
		await this.pump;
		this.events.close();
	}

	private async run(
		stream: AsyncIterable<unknown>,
		translator: ClaudeTranslator,
	): Promise<void> {
		try {
			for await (const message of stream) {
				if (this.disposed) return;
				for (const event of translator.translate(message)) {
					this.events.push(event);
				}
			}
		} catch (error) {
			for (const event of translator.interrupt(String(error))) {
				this.events.push(event);
			}
		}
	}

	private requestApproval(
		input: Record<string, unknown>,
		toolUseId: string,
	): Promise<PermissionResult> {
		const approvalId = this.mintId();
		return new Promise<PermissionResult>((settle) => {
			this.approvals.set(approvalId, { toolUseId, input, settle });
			this.emitApproval(approvalId, toolUseId, "pending");
		});
	}

	private emitApproval(
		approvalId: string,
		toolUseId: string,
		status: ApprovalRequest["status"],
		decision?: Decision,
	): void {
		const item: ApprovalRequest = {
			id: approvalId,
			kind: "approval_request",
			startedAtMs: this.now(),
			...(status === "pending" ? {} : { completedAtMs: this.now() }),
			targetItemId: toolUseId,
			title: "Allow this tool call?",
			status,
			...(decision ? { decision } : {}),
		};
		this.events.push({
			kind: "item",
			item,
			turnId: this.translator?.currentTurnId ?? "unattributed",
		});
	}

	private now(): number {
		return (this.options.now ?? Date.now)();
	}

	private mintId(): string {
		return (this.options.mintId ?? randomUUID)();
	}
}

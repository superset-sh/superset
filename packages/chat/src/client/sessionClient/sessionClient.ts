import type {
	ChatRouterInputs,
	ChatRouterOutputs,
} from "@superset/chat-runtime";
import type { Cursor } from "../../protocol/cursor";
import type { DeltaChannel, Envelope } from "../../protocol/envelope";
import type { Decision, UserContent } from "../../protocol/items";
import type {
	SessionStream,
	StreamSocketFactory,
	StreamStatus,
	Wait,
} from "../subscribeToSession";
import { buildStreamUrl, subscribeToSession } from "../subscribeToSession";

export type ChatTransport = {
	[Procedure in keyof ChatRouterInputs & keyof ChatRouterOutputs]: (
		input: ChatRouterInputs[Procedure],
	) => Promise<ChatRouterOutputs[Procedure]>;
};

export type GetItemsPage = {
	before?: Cursor;
	limit?: number;
};

export type PromptOptions = {
	content: UserContent[];
	clientId: string;
	commandId?: string;
	steer?: { expectedTurnId: string };
};

export type SessionSubscribeOptions = {
	deltas?: readonly DeltaChannel[];
	since?: Cursor | null;
	onEnvelope(envelope: Envelope): void;
	onReset?(reason: string): void;
	onStatusChange?(status: StreamStatus): void;
};

export type SessionClientOptions = {
	sessionId: string;
	transport: ChatTransport;
	streamBaseUrl: string;
	createSocket: StreamSocketFactory;
	mintId?(): string;
	wait?: Wait;
	backoffInitialMs?: number;
	backoffMaxMs?: number;
};

export type SessionClient = {
	sessionId: string;
	getSession(): Promise<ChatRouterOutputs["getSession"]>;
	getItems(page?: GetItemsPage): Promise<ChatRouterOutputs["getItems"]>;
	getOutline(): Promise<ChatRouterOutputs["getOutline"]>;
	getItemBodies(itemIds: string[]): Promise<ChatRouterOutputs["getItemBodies"]>;
	prompt(options: PromptOptions): Promise<ChatRouterOutputs["prompt"]>;
	removeQueuedPrompt(itemId: string): Promise<void>;
	steerQueuedPrompt(itemId: string): Promise<void>;
	resumeQueue(): Promise<void>;
	cancelTurn(turnId: string, options?: { pauseQueue?: boolean }): Promise<void>;
	stopBackgroundTask(taskId: string): Promise<boolean>;
	respondToApproval(approvalId: string, decision: Decision): Promise<void>;
	setMode(modeId: string): Promise<void>;
	setConfigOption(configId: string, value: string): Promise<void>;
	subscribe(options: SessionSubscribeOptions): SessionStream;
	close(): void;
};

export function createSessionClient(
	options: SessionClientOptions,
): SessionClient {
	const mintId = options.mintId ?? (() => crypto.randomUUID());
	const sessionId = options.sessionId;
	const streams = new Set<SessionStream>();

	return {
		sessionId,

		getSession: () => options.transport.getSession({ sessionId }),

		getItems: (page = {}) =>
			options.transport.getItems({
				sessionId,
				before: page.before,
				limit: page.limit,
			}),

		getOutline: () => options.transport.getOutline({ sessionId }),

		getItemBodies: (itemIds) =>
			options.transport.getItemBodies({ sessionId, itemIds }),

		prompt: (promptOptions) =>
			options.transport.prompt({
				commandId: promptOptions.commandId ?? mintId(),
				sessionId,
				clientId: promptOptions.clientId,
				content: promptOptions.content,
				...(promptOptions.steer ? { steer: promptOptions.steer } : {}),
			}),

		removeQueuedPrompt: async (itemId) => {
			await options.transport.removeQueuedPrompt({
				commandId: mintId(),
				sessionId,
				itemId,
			});
		},

		steerQueuedPrompt: async (itemId) => {
			await options.transport.steerQueuedPrompt({
				commandId: mintId(),
				sessionId,
				itemId,
			});
		},

		resumeQueue: async () => {
			await options.transport.resumeQueue({ commandId: mintId(), sessionId });
		},

		cancelTurn: async (turnId, cancelOptions) => {
			await options.transport.cancelTurn({
				commandId: mintId(),
				sessionId,
				turnId,
				...(cancelOptions?.pauseQueue ? { pauseQueue: true } : {}),
			});
		},

		stopBackgroundTask: (taskId) =>
			options.transport.stopBackgroundTask({
				commandId: mintId(),
				sessionId,
				taskId,
			}),

		respondToApproval: async (approvalId, decision) => {
			await options.transport.respondToApproval({
				commandId: mintId(),
				sessionId,
				approvalId,
				decision,
			});
		},

		setMode: async (modeId) => {
			await options.transport.setMode({
				commandId: mintId(),
				sessionId,
				modeId,
			});
		},

		setConfigOption: async (configId, value) => {
			await options.transport.setConfigOption({
				commandId: mintId(),
				sessionId,
				configId,
				value,
			});
		},

		subscribe(subscribeOptions) {
			const deltas = subscribeOptions.deltas ?? [];
			const stream = subscribeToSession({
				createSocket: options.createSocket,
				url: (since) =>
					buildStreamUrl({
						baseUrl: options.streamBaseUrl,
						sessionId,
						deltas,
						since,
					}),
				since: subscribeOptions.since,
				onEnvelope: subscribeOptions.onEnvelope,
				onReset: subscribeOptions.onReset,
				onStatusChange: subscribeOptions.onStatusChange,
				wait: options.wait,
				backoffInitialMs: options.backoffInitialMs,
				backoffMaxMs: options.backoffMaxMs,
			});
			streams.add(stream);
			return {
				cursor: () => stream.cursor(),
				close: () => {
					streams.delete(stream);
					stream.close();
				},
			};
		},

		close() {
			for (const stream of [...streams]) stream.close();
			streams.clear();
		},
	};
}

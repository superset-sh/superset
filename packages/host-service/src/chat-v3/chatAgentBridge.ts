import type {
	BackgroundTask,
	Envelope,
	SessionStatus,
} from "@superset/chat/protocol";
import { isDeltaEnvelope, isDurableEnvelope } from "@superset/chat/protocol";
import type {
	HarnessFactoryOptions,
	LiveSession,
	LiveSessionObserver,
} from "@superset/chat-runtime";
import {
	AGENT_IDENTITY_IDS,
	type AgentIdentityId,
} from "@superset/shared/agent-catalog";
import type { AgentLifecycleEventType } from "../events";
import { chatPortTerminalIds, portManager } from "../ports/port-manager";
import { fanOutAgentLifecycle } from "../trpc/router/notifications/fan-out-agent-lifecycle";
import type { HostServiceContext } from "../types";
import { ACP_HARNESSES } from "./acpCatalogue";

const LIFECYCLE_BY_STATUS: Partial<
	Record<SessionStatus, AgentLifecycleEventType>
> = {
	running: "Start",
	awaiting_input: "PermissionRequest",
	idle: "Stop",
	dead: "Failed",
};

const MAX_PREVIEW_LENGTH = 4000;
const DETAIL_BROADCAST_MS = 2000;

type BoundChat = {
	sessionId: string;
	terminalId: string;
	workspaceId: string;
	agentId: AgentIdentityId;
	agentSessionId?: string;
	lastEventType?: AgentLifecycleEventType;
	lastReply?: string;
	backgroundTasks?: BackgroundTask[];
	queuedPrompts: number;
	pid?: number;
	established?: true;
};

function sameTasks(
	next: BackgroundTask[],
	prior: BackgroundTask[] | undefined,
	{ withDetail }: { withDetail: boolean },
): boolean {
	return (
		prior !== undefined &&
		next.length === prior.length &&
		next.every(
			(task, index) =>
				task.id === prior[index]?.id &&
				task.name === prior[index]?.name &&
				task.canStop === prior[index]?.canStop &&
				(!withDetail || task.detail === prior[index]?.detail),
		)
	);
}

export type ChatAgentBridge = LiveSessionObserver & {
	spawned(sessionId: string, pid: number): void;
};

export function agentIdForHarness(
	harness: string,
): AgentIdentityId | undefined {
	const binary =
		ACP_HARNESSES[harness]?.binary ??
		(harness === "claude-code" ? "claude" : harness);
	return (AGENT_IDENTITY_IDS as readonly string[]).includes(binary)
		? (binary as AgentIdentityId)
		: undefined;
}

export function createChatAgentBridge(
	ctx: HostServiceContext,
	{ detailBroadcastMs = DETAIL_BROADCAST_MS } = {},
): ChatAgentBridge {
	const chats = new Map<string, BoundChat>();
	const pendingBroadcasts = new Map<string, ReturnType<typeof setTimeout>>();
	const sessionByTerminal = new Map<string, string>();

	const current = (sessionId: string): BoundChat | undefined => {
		const chat = chats.get(sessionId);
		return chat && sessionByTerminal.get(chat.terminalId) === sessionId
			? chat
			: undefined;
	};

	const bindingsChanged = (workspaceId: string) => {
		const pending = pendingBroadcasts.get(workspaceId);
		if (pending) clearTimeout(pending);
		pendingBroadcasts.delete(workspaceId);
		ctx.eventBus.broadcastAgentBindingsChanged({
			workspaceId,
			occurredAt: Date.now(),
		});
	};

	const bindingsChangedSoon = (workspaceId: string) => {
		if (pendingBroadcasts.has(workspaceId)) return;
		const timer = setTimeout(
			() => bindingsChanged(workspaceId),
			detailBroadcastMs,
		);
		timer.unref?.();
		pendingBroadcasts.set(workspaceId, timer);
	};

	const store = (
		chat: BoundChat,
		eventType: AgentLifecycleEventType,
		occurredAt: number,
	) =>
		ctx.terminalAgentStore.recordChatEvent({
			terminalId: chat.terminalId,
			workspaceId: chat.workspaceId,
			eventType,
			agentId: chat.agentId,
			agentSessionId: chat.agentSessionId,
			chatSessionId: chat.sessionId,
			occurredAt,
		});

	const attach = (chat: BoundChat) => {
		const occurredAt = Date.now();
		store(chat, chat.lastEventType ?? "Attached", occurredAt);
		bindingsChanged(chat.workspaceId);
	};

	const record = (chat: BoundChat, eventType: AgentLifecycleEventType) => {
		const occurredAt = Date.now();
		store(chat, eventType, occurredAt);
		chat.lastEventType = eventType;
		const preview = eventType === "Stop" ? chat.lastReply : undefined;
		fanOutAgentLifecycle(ctx, {
			workspaceId: chat.workspaceId,
			eventType,
			terminalId: chat.terminalId,
			agent: {
				agentId: chat.agentId,
				...(chat.agentSessionId ? { sessionId: chat.agentSessionId } : {}),
			},
			...(preview ? { preview } : {}),
			occurredAt,
		});
		if (eventType === "Start") chat.lastReply = undefined;
	};

	const onStatus = (chat: BoundChat, status: SessionStatus) => {
		if (status !== "starting" && status !== "dead") chat.established = true;
		const eventType = LIFECYCLE_BY_STATUS[status];
		if (!eventType || eventType === chat.lastEventType) return;
		const settledWithoutTurn =
			eventType === "Stop" &&
			chat.lastEventType !== "Start" &&
			chat.lastEventType !== "PermissionRequest";
		if (settledWithoutTurn) return;
		record(chat, eventType);
	};

	return {
		started(options: HarnessFactoryOptions) {
			const agentId = agentIdForHarness(options.harness);
			if (!options.terminalId || !agentId) return;
			const chat: BoundChat = {
				sessionId: options.sessionId,
				terminalId: options.terminalId,
				workspaceId: options.scopeId,
				agentId,
				queuedPrompts: 0,
				...(options.resume
					? { agentSessionId: options.resume.harnessSessionId }
					: {}),
			};
			chats.set(options.sessionId, chat);
			sessionByTerminal.set(chat.terminalId, options.sessionId);
			chatPortTerminalIds.add(chat.terminalId);
			portManager.upsertSession(chat.terminalId, chat.workspaceId, null);
			attach(chat);
		},

		spawned(sessionId, pid) {
			const spawnedChat = chats.get(sessionId);
			if (spawnedChat) spawnedChat.pid = pid;
			const chat = current(sessionId);
			if (!chat) return;
			portManager.upsertSession(chat.terminalId, chat.workspaceId, pid);
		},

		published(envelope: Envelope, session: LiveSession) {
			const chat = current(envelope.sessionId);
			if (!chat) return;
			if (session.queuedCount !== chat.queuedPrompts) {
				chat.queuedPrompts = session.queuedCount;
				ctx.terminalAgentStore.updateChat(chat.terminalId, {
					queuedPrompts: chat.queuedPrompts,
				});
				bindingsChanged(chat.workspaceId);
			}
			if (isDeltaEnvelope(envelope)) {
				const { delta } = envelope;
				if (delta.type === "background") {
					const tasks = chat.backgroundTasks?.map((task) =>
						task.id === delta.itemId ? { ...task, detail: delta.append } : task,
					);
					if (!tasks) return;
					chat.backgroundTasks = tasks;
					ctx.terminalAgentStore.updateChat(chat.terminalId, {
						backgroundTasks: tasks,
					});
					bindingsChangedSoon(chat.workspaceId);
					return;
				}
				if (envelope.delta.type !== "tool_input") {
					portManager.checkOutputForHint(
						chat.terminalId,
						envelope.delta.append,
					);
				}
				return;
			}
			if (!isDurableEnvelope(envelope)) return;
			const event = envelope.event;
			if (event.type === "item") {
				const { kind, text } = event.item;
				if (kind === "agent_message" && typeof text === "string") {
					chat.lastReply = text.slice(0, MAX_PREVIEW_LENGTH);
				}
				return;
			}
			if (event.type !== "session") return;
			const tasks = event.session.backgroundTasks;
			if (
				tasks &&
				!sameTasks(tasks, chat.backgroundTasks, { withDetail: true })
			) {
				const listChanged = !sameTasks(tasks, chat.backgroundTasks, {
					withDetail: false,
				});
				chat.backgroundTasks = tasks;
				ctx.terminalAgentStore.updateChat(chat.terminalId, {
					backgroundTasks: tasks,
				});
				if (listChanged) bindingsChanged(chat.workspaceId);
				else bindingsChangedSoon(chat.workspaceId);
			}
			const harnessSessionId = event.session.harnessSessionId;
			if (harnessSessionId && harnessSessionId !== chat.agentSessionId) {
				chat.agentSessionId = harnessSessionId;
				attach(chat);
			}
			onStatus(chat, event.session.status);
		},

		stopped(sessionId) {
			const chat = chats.get(sessionId);
			chats.delete(sessionId);
			if (!chat || sessionByTerminal.get(chat.terminalId) !== sessionId) {
				return;
			}
			const previous = chat.established
				? undefined
				: [...chats.entries()]
						.reverse()
						.find(([, other]) => other.terminalId === chat.terminalId);
			if (previous) {
				const [previousId, previousChat] = previous;
				sessionByTerminal.set(chat.terminalId, previousId);
				portManager.upsertSession(
					previousChat.terminalId,
					previousChat.workspaceId,
					previousChat.pid ?? null,
				);
				attach(previousChat);
				ctx.terminalAgentStore.updateChat(previousChat.terminalId, {
					...(previousChat.backgroundTasks
						? { backgroundTasks: previousChat.backgroundTasks }
						: {}),
					queuedPrompts: previousChat.queuedPrompts,
				});
				return;
			}
			sessionByTerminal.delete(chat.terminalId);
			chatPortTerminalIds.delete(chat.terminalId);
			portManager.unregisterSession(chat.terminalId);
			ctx.terminalAgentStore.endChat(chat.terminalId);
			bindingsChanged(chat.workspaceId);
		},
	};
}

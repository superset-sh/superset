/**
 * Phase 2 chat surface. Shown when the `CHAT_V2_OPENCODE_REBUILD` flag
 * is on. Renders the new Timeline on top of the same data the legacy
 * UI uses (via Phase 1 dual-write). Composer + docks wired in Phase 4
 * and 5 MVP.
 *
 * See apps/desktop/plans/20260421-v2-chat-refactor-phased-plan.md.
 */

import type { ImagePart, Part, UserMessage } from "@superset/chat/shared";
import { workspaceTrpc } from "@superset/workspace-client";
import type { PendingAttachment } from "./components/Composer/Editor";
import { useCallback, useEffect, useState } from "react";
import { useChatDisplay as useWorkspaceChatDisplay } from "../../hooks/useWorkspaceChatDisplay";
import { useChatStore } from "../../store";
import { selectDocks } from "../../store/dockSelectors";
import type { FollowupQueueItem } from "../../store/followupStore";
import { useFollowupStore } from "../../store/followupStore";

// Module-scoped empty array so Zustand selectors with `?? []` don't hand
// back a fresh reference every render. Returning a new array trips
// Zustand's default Object.is equality and can schedule endless
// re-renders in subscribers.
const EMPTY_FOLLOWUP: FollowupQueueItem[] = [];
import { ChatSearch } from "./components/ChatSearch";
import { ChatStoreDebug } from "./components/ChatStoreDebug";
import { Composer } from "./components/Composer";
import { DocksStack } from "./components/Docks";
import { FollowupDock } from "./components/Docks/FollowupDock";
import { Timeline } from "./components/Timeline";
import { useChatStream } from "./hooks/useChatStream/useChatStream";
import { useFollowupDrain } from "./hooks/useFollowupDrain/useFollowupDrain";

export interface ChatSurfaceProps {
	sessionId: string | null;
	workspaceId: string;
	workspacePath: string;
	organizationId: string | null;
	/**
	 * Create a chat session record lazily (or reuse an existing one)
	 * and return its id. Called on the first composer submit so users
	 * don't have to click "new chat" before typing.
	 */
	getOrCreateSession: () => Promise<string>;
	/** Explicit "new chat" action — available from the empty state. */
	onNewChat?: () => Promise<void> | void;
}

export function ChatSurface(props: ChatSurfaceProps) {
	const isDev = process.env.NODE_ENV === "development";

	// Phase 6 streaming subscription. No-op until host-service exposes
	// chat.streamSession + chat.getSnapshot — passing undefined transport
	// bindings keeps the hook inert, so the dual-write polling path
	// remains authoritative. When the server lands, inject the subscribe
	// and fetchSnapshot functions here (wrappers around
	// workspaceTrpc.chat.streamSession.subscribe and
	// workspaceTrpc.chat.getSnapshot.query) to flip transports.
	useChatStream({
		sessionId: props.sessionId,
		subscribe: undefined,
		fetchSnapshot: undefined,
	});

	// Pull the legacy display hook so we can drive mutations from the new
	// docks. The dual-write bridges (wired inside useWorkspaceChatDisplay)
	// push state into the new chat store already.
	const display = useWorkspaceChatDisplay({
		sessionId: props.sessionId,
		workspaceId: props.workspaceId,
	});
	const commands = display.commands;

	const approval = useChatStore((s) =>
		props.sessionId ? selectDocks(s, props.sessionId).approval : undefined,
	);
	const question = useChatStore((s) =>
		props.sessionId ? selectDocks(s, props.sessionId).question : undefined,
	);
	const plan = useChatStore((s) =>
		props.sessionId ? selectDocks(s, props.sessionId).plan : undefined,
	);

	const [approvalSubmitting, setApprovalSubmitting] = useState(false);
	const [questionSubmitting, setQuestionSubmitting] = useState(false);
	const [planSubmitting, setPlanSubmitting] = useState(false);

	const onApprovalRespond = useCallback(
		async (decision: "approve" | "decline" | "always_allow_category") => {
			setApprovalSubmitting(true);
			try {
				await commands?.respondToApproval?.({ payload: { decision } });
			} finally {
				setApprovalSubmitting(false);
			}
		},
		[commands],
	);

	const onQuestionRespond = useCallback(
		async (answer: string) => {
			if (!question) return;
			setQuestionSubmitting(true);
			try {
				await commands?.respondToQuestion?.({
					payload: { questionId: question.id, answer },
				});
			} finally {
				setQuestionSubmitting(false);
			}
		},
		[commands, question],
	);

	const onPlanRespond = useCallback(
		async (
			response:
				| { action: "approved" }
				| { action: "rejected"; feedback?: string },
		) => {
			if (!plan) return;
			setPlanSubmitting(true);
			try {
				await commands?.respondToPlan?.({
					payload: { planId: plan.id, response },
				});
			} finally {
				setPlanSubmitting(false);
			}
		},
		[commands, plan],
	);

	const isRunning = display.isRunning ?? false;
	const blockedByDock = Boolean(approval || question || plan);

	// Followup queue state — items the user sent while the agent was
	// running. The drain hook below flushes them when the session is idle.
	const followupItems = useFollowupStore((s) =>
		props.sessionId
			? s.items[props.sessionId] ?? EMPTY_FOLLOWUP
			: EMPTY_FOLLOWUP,
	);
	const followupPaused = useFollowupStore((s) =>
		props.sessionId ? s.paused[props.sessionId] === true : false,
	);
	const enqueueFollowup = useFollowupStore((s) => s.enqueue);
	const removeFollowup = useFollowupStore((s) => s.remove);
	const editFollowup = useFollowupStore((s) => s.editPrompt);
	const popFollowup = useFollowupStore((s) => s.popHead);
	const pauseFollowup = useFollowupStore((s) => s.pause);
	const resumeFollowup = useFollowupStore((s) => s.resume);

	// Direct tRPC mutation. We bypass `commands.sendMessage` deliberately:
	// on the very first submit for a brand-new pane, `commands` is a
	// memoized object still closed over the old `sessionId === null`, and
	// throws "Chat session is still starting" before React commits the
	// new sessionId. Calling the mutation directly with the just-created
	// sessionId avoids that race.
	const sendMessageMutation = workspaceTrpc.chat.sendMessage.useMutation();
	const workspaceId = props.workspaceId;

	const addOptimistic = useChatStore((s) => s.addOptimistic);
	const rollbackOptimistic = useChatStore((s) => s.rollbackOptimistic);

	const submitToAgent = useCallback(
		async (
			sessionIdForSend: string,
			text: string,
			attachments: PendingAttachment[] = [],
		) => {
			// Optimistic user message so the Timeline shows it instantly.
			// The dual-write will replace it with the server's canonical
			// user message on the next poll (applySessionSnapshot's
			// preserve-optimistic logic keeps it visible until then).
			const now = Date.now();
			const optId = `opt-${now}-${Math.random().toString(36).slice(2, 8)}`;
			const userMessage: UserMessage = {
				id: optId,
				sessionID: sessionIdForSend,
				role: "user",
				time: { created: now },
			};
			const parts: Part[] = [];
			if (text) {
				parts.push({
					id: `${optId}:p0`,
					messageID: optId,
					sessionID: sessionIdForSend,
					type: "text",
					text,
					time: { start: now, end: now },
				});
			}
			attachments.forEach((att, idx) => {
				const imgPart: ImagePart = {
					id: `${optId}:p${idx + 1}`,
					messageID: optId,
					sessionID: sessionIdForSend,
					type: "image",
					mime: att.mediaType,
					url: `data:${att.mediaType};base64,${att.data}`,
					filename: att.filename,
					time: { start: now, end: now },
				};
				parts.push(imgPart);
			});
			addOptimistic(sessionIdForSend, userMessage, parts);

			try {
				await sendMessageMutation.mutateAsync({
					sessionId: sessionIdForSend,
					workspaceId,
					payload: {
						content: text,
						files: attachments.map((att) => ({
							data: att.data,
							mediaType: att.mediaType,
							filename: att.filename ?? "pasted-image",
						})),
					},
				});
			} catch (error) {
				rollbackOptimistic(sessionIdForSend, optId);
				throw error;
			}
		},
		[addOptimistic, rollbackOptimistic, sendMessageMutation, workspaceId],
	);

	const getOrCreateSession = props.getOrCreateSession;
	const onComposerSubmit = useCallback(
		async (text: string, attachments: PendingAttachment[]) => {
			// Create session lazily if we don't have one yet — mirrors
			// the legacy pane, which also creates on first send.
			const ensuredSessionId = await getOrCreateSession();

			// If the agent is currently working, queue instead of sending.
			// Queueing doesn't carry attachments for now — Phase 7 follow-up
			// extends FollowupQueueItem with a payload slot.
			if (isRunning) {
				if (text.trim()) {
					enqueueFollowup(ensuredSessionId, text);
				}
				return;
			}
			await submitToAgent(ensuredSessionId, text, attachments);
		},
		[getOrCreateSession, isRunning, enqueueFollowup, submitToAgent],
	);

	const onComposerStop = useCallback(async () => {
		await commands?.stop?.();
	}, [commands]);

	const drainSubmit = useCallback(
		async (text: string) => {
			if (!props.sessionId) return;
			await submitToAgent(props.sessionId, text);
		},
		[props.sessionId, submitToAgent],
	);

	useFollowupDrain({
		sessionId: props.sessionId,
		isRunning,
		blockedByDock,
		onSubmit: drainSubmit,
	});

	const onFollowupSendNow = useCallback(
		(id: string) => {
			if (!props.sessionId) return;
			const item = followupItems.find((i) => i.id === id);
			if (!item) return;
			removeFollowup(props.sessionId, id);
			void submitToAgent(props.sessionId, item.prompt);
		},
		[followupItems, props.sessionId, removeFollowup, submitToAgent],
	);

	const onFollowupTogglePause = useCallback(() => {
		if (!props.sessionId) return;
		if (followupPaused) resumeFollowup(props.sessionId);
		else pauseFollowup(props.sessionId);
	}, [followupPaused, pauseFollowup, props.sessionId, resumeFollowup]);

	// Ctrl/Cmd+F opens in-chat search.
	const [searchOpen, setSearchOpen] = useState(false);
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "f") {
				// Don't hijack if the user is inside a text field / editor —
				// native find-as-you-type is rare here but browser Find is
				// usually unreachable anyway.
				const target = e.target as HTMLElement | null;
				const inField =
					target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
				if (inField) return;
				e.preventDefault();
				setSearchOpen(true);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	return (
		<div className="relative flex h-full w-full flex-col">
			<div className="bg-muted/30 text-muted-foreground border-b px-4 py-1 text-[11px]">
				Chat v2 rebuild preview — Tiptap composer, drafts, and mentions
				land in the Phase 5 follow-up. For now this sends plain text.
			</div>

			{props.sessionId ? (
				<>
					<Timeline sessionId={props.sessionId} />
					<ChatSearch
						sessionId={props.sessionId}
						open={searchOpen}
						onClose={() => setSearchOpen(false)}
					/>
				</>
			) : (
				<EmptyState />
			)}

			{props.sessionId && (approval || question || plan) && (
				<DocksStack
					sessionId={props.sessionId}
					onApprovalRespond={onApprovalRespond}
					onQuestionRespond={onQuestionRespond}
					onPlanRespond={onPlanRespond}
					approvalSubmitting={approvalSubmitting}
					questionSubmitting={questionSubmitting}
					planSubmitting={planSubmitting}
				/>
			)}

			{props.sessionId && followupItems.length > 0 && (
				<div className="mx-auto w-full max-w-3xl px-4 py-2">
					<FollowupDock
						items={followupItems}
						paused={followupPaused}
						onSendNow={onFollowupSendNow}
						onRemove={(id) =>
							props.sessionId && removeFollowup(props.sessionId, id)
						}
						onEdit={(id, prompt) =>
							props.sessionId && editFollowup(props.sessionId, id, prompt)
						}
						onTogglePause={onFollowupTogglePause}
					/>
				</div>
			)}

			<div className="px-4 py-3">
				<Composer
					onSubmit={onComposerSubmit}
					onStop={onComposerStop}
					isRunning={isRunning}
					blockedByDock={blockedByDock}
					workspaceId={props.workspaceId}
					sessionId={props.sessionId}
					placeholder={
						props.sessionId
							? "Send a message…"
							: "Start a new chat — just type and hit Enter"
					}
				/>
			</div>

			{isDev && (
				<ChatStoreDebug
					sessionId={props.sessionId}
					workspaceId={props.workspaceId}
				/>
			)}
		</div>
	);
}

function EmptyState() {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 py-16 text-center">
			<div className="text-sm font-medium">Start a new chat</div>
			<div className="text-muted-foreground max-w-sm text-xs">
				Type a message below and press Enter. A new session is created
				automatically on your first send.
			</div>
		</div>
	);
}

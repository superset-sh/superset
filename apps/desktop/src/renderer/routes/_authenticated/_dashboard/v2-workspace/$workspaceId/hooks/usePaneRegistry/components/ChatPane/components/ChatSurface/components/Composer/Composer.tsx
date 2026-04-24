/**
 * Phase 5.1 v2 composer. Tiptap editor + image paste handler +
 * per-session draft persistence. Submits plain text with optional
 * pending image attachments (pasted or dropped) to the callback.
 *
 * Still deferred to Phase 5.2+:
 *   - File drag-and-drop
 *   - Mentions (@file) and slash-command popovers
 *   - Model picker + MCP controls lift-and-shift from legacy composer
 *   - optID handshake for optimistic (today uses legacy's
 *     text-signature optimistic via applySessionSnapshot preservation).
 */

import { Button } from "@superset/ui/button";
import { ArrowUp, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { composerDraftKey, useComposerDraftStore } from "./draft";
import {
	AttachmentRow,
	Editor,
	type PendingAttachment,
} from "./Editor";

export interface ComposerProps {
	/**
	 * Submit a message. `attachments` is a list of pending image
	 * attachments the user pasted; callers should forward them into
	 * the server mutation as `payload.files`.
	 */
	onSubmit: (text: string, attachments: PendingAttachment[]) => Promise<void>;
	/** Abort current agent response, if running. */
	onStop?: () => Promise<void>;
	/** Whether the agent is currently generating. */
	isRunning?: boolean;
	/** Whether any blocking dock is visible (approval/question/plan). */
	blockedByDock?: boolean;
	/** Placeholder — usually workspace-scoped hint. */
	placeholder?: string;
	/** Auto-focus on mount (e.g. when pane gains focus). */
	autoFocus?: boolean;
	/**
	 * Identity of the draft to persist. When provided, the editor
	 * hydrates from localStorage (Phase 5.3) and auto-saves changes
	 * with a 300ms debounce + beforeunload flush.
	 */
	workspaceId?: string;
	sessionId?: string | null;
}

export function Composer({
	onSubmit,
	onStop,
	isRunning = false,
	blockedByDock = false,
	placeholder = "Send a message…",
	autoFocus = false,
	workspaceId,
	sessionId,
}: ComposerProps) {
	const draftKey =
		workspaceId !== undefined
			? composerDraftKey(workspaceId, sessionId ?? null)
			: null;

	const persistedPrompt = useComposerDraftStore((s) =>
		draftKey ? (s.drafts[draftKey]?.prompt ?? "") : "",
	);
	const setDraftPrompt = useComposerDraftStore((s) => s.setPrompt);
	const clearDraft = useComposerDraftStore((s) => s.clearDraft);

	const [text, setText] = useState(persistedPrompt);
	const [attachments, setAttachments] = useState<PendingAttachment[]>([]);

	// Track the last value we wrote ourselves so we can skip save effects
	// that would only echo the store's own state back at it.
	const lastPersistedRef = useRef(persistedPrompt);

	// Rehydrate when the draftKey changes (switching sessions, new chat
	// promotion when first message creates a real sessionId, etc.).
	// Attachments don't persist across sessions today — clearing them on
	// switch avoids leaking a pasted image into the wrong thread.
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional — only re-hydrate on identity change
	useEffect(() => {
		setText(persistedPrompt);
		setAttachments([]);
		lastPersistedRef.current = persistedPrompt;
	}, [draftKey]);

	// Save on every change — debounced storage layer coalesces writes.
	useEffect(() => {
		if (!draftKey) return;
		if (text === lastPersistedRef.current) return;
		lastPersistedRef.current = text;
		setDraftPrompt(draftKey, text);
	}, [draftKey, text, setDraftPrompt]);

	// Textarea is only disabled when a blocking dock is up. Submit-in-flight
	// does NOT disable input — users can keep typing (followup queue will
	// catch the next message if the agent is still running).
	const disabled = blockedByDock;

	const doSubmit = useCallback(() => {
		const trimmed = text.trim();
		if (disabled) return;
		if (!trimmed && attachments.length === 0) return;
		const pendingText = trimmed;
		const pendingAttachments = attachments;
		// Clear input + attachments + draft immediately — user should see
		// their text disappear the moment they hit Enter, with the
		// optimistic user message appearing in the timeline.
		setText("");
		setAttachments([]);
		if (draftKey) clearDraft(draftKey);
		Promise.resolve(onSubmit(pendingText, pendingAttachments)).catch((error) => {
			// Submit failed — restore state so the user can retry.
			setText(pendingText);
			setAttachments(pendingAttachments);
			console.error("composer submit failed", error);
		});
	}, [text, attachments, onSubmit, disabled, draftKey, clearDraft]);

	const onAttachImage = useCallback((att: PendingAttachment) => {
		setAttachments((prev) => [...prev, att]);
	}, []);

	const onRemoveAttachment = useCallback((id: string) => {
		setAttachments((prev) => prev.filter((a) => a.id !== id));
	}, []);

	const canSend = !disabled && (text.trim().length > 0 || attachments.length > 0);

	return (
		<div className="border-border bg-background mx-auto w-full max-w-3xl rounded-md border px-3 py-2 shadow-sm">
			<AttachmentRow
				attachments={attachments}
				onRemove={onRemoveAttachment}
			/>
			<Editor
				value={text}
				onChange={setText}
				onSubmit={doSubmit}
				onAttachImage={onAttachImage}
				placeholder={
					blockedByDock
						? "Respond to the dock above to continue…"
						: placeholder
				}
				disabled={blockedByDock}
				autoFocus={autoFocus}
			/>
			<div className="mt-2 flex items-center justify-between">
				<div className="text-muted-foreground text-[11px]">
					Enter to send · Shift+Enter for newline · paste images to attach
				</div>
				{isRunning && onStop ? (
					<Button
						size="sm"
						variant="secondary"
						onClick={() => void onStop()}
					>
						<Square className="mr-1 size-3" /> Stop
					</Button>
				) : (
					<Button
						size="sm"
						onClick={() => doSubmit()}
						disabled={!canSend}
					>
						<ArrowUp className="mr-1 size-3" /> Send
					</Button>
				)}
			</div>
		</div>
	);
}

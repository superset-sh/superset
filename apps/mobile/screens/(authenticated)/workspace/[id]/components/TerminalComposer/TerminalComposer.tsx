import { useLingui } from "@lingui/react/macro";
import {
	Composer,
	type ComposerHandle,
	type ComposerQuickKey,
	type ComposerQuickKeysAction,
	type ComposerSessionTab,
	type ComposerSlashCommand,
} from "@superset/composer";
import type { SlashCommand } from "@superset/shared/slash-commands";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Alert, View } from "react-native";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { posthog } from "@/lib/posthog";
import { useAttachmentsSheet } from "@/screens/(authenticated)/hooks/useAttachmentsSheet";
import { useComposerDraft } from "@/screens/(authenticated)/hooks/useComposerDraft";
import { usePasteAttachments } from "@/screens/(authenticated)/hooks/usePasteAttachments";
import { workspaceDraftKey } from "@/screens/(authenticated)/stores/composerDraftsStore";
import { QUICK_KEYS, type TerminalQuickKey } from "./constants";
import {
	type TerminalAttachmentTarget,
	useWriteTerminalAttachments,
} from "./hooks/useWriteTerminalAttachments";

/** Copy Selection replaces the whole strip while a selection is live. */
const COPY_SELECTION_KEY = "copy-selection";

interface TerminalComposerProps {
	/**
	 * Scopes the draft. One draft per workspace rather than per terminal: an
	 * agent per workspace is the common shape, and starting to type before
	 * noticing you are on the wrong terminal is far more common than wanting the
	 * two sessions to hold different drafts.
	 */
	workspaceId: string;
	placeholder?: string;
	/** Submit the current draft to the PTY. Rejects if it never got there. */
	onSubmit: (text: string) => Promise<void>;
	onQuickKey: (key: TerminalQuickKey) => void;
	/** Where attachments land; null while the workspace or host is unresolved. */
	attachmentTarget: TerminalAttachmentTarget | null;
	/**
	 * Only agent sessions can use an attachment: they read the paths out of the
	 * prompt. A plain shell tries to EXECUTE them ("permission denied:
	 * .superset/attachments/IMG_0006.HEIC"), so it doesn't get the + button.
	 */
	allowAttachments: boolean;
	/**
	 * What the active agent can run behind `/` — the host's answer for this
	 * workspace + agent. Empty for plain shells and old hosts, which is also
	 * how the panel stays hidden there.
	 */
	slashCommands: SlashCommand[];
	/**
	 * The workspace's sessions, drawn by the composer above the quick keys.
	 * Empty hides the strip — a workspace with nothing running has its own
	 * empty state, which already carries a way to start one.
	 */
	sessionTabs: ComposerSessionTab[];
	onSessionTabPress: (terminalId: string) => void;
	/** Close was chosen. Nothing is dead yet — this is where the confirm goes. */
	onSessionTabClose: (terminalId: string) => void;
	/** Copy id was chosen from the press-and-hold menu. */
	onSessionTabCopyId: (terminalId: string) => void;
	onNewSessionPress: () => void;
	onAllSessionsPress: () => void;
	/**
	 * The static chip beside the quick keys — this workspace's pull requests.
	 * Omitted when it has none, which is also how a workspace that never
	 * produced one never grows the control.
	 */
	quickKeysAction?: ComposerQuickKeysAction;
	onQuickKeysActionPress: () => void;
	/** Focused, or the keyboard is up — the screen covers the terminal with a
	 *  tap-to-dismiss target while this is true. */
	onActiveChange?: (active: boolean) => void;
	/** How much room the composer takes above the safe area, so the terminal can
	 *  inset for an overlay it cannot measure. */
	onHeightChange?: (height: number) => void;
	/** Terminal select mode: swaps the quick keys for Copy Selection. */
	selectActive: boolean;
	selectHasSelection: boolean;
	onCopySelection: () => void;
}

/**
 * Terminal input: the native composer with the terminal's own chrome.
 *
 * Two differences from the home surface, both of them props rather than
 * children. The backdrop is `passthrough`, so the transcript stays scrollable
 * while the keyboard is up — the home screen dims and takes the outside tap
 * instead. And the quick keys ride above the card *inside* the composer's own
 * view tree; they are described here as data and drawn there.
 */
export const TerminalComposer = forwardRef<
	ComposerHandle,
	TerminalComposerProps
>(function TerminalComposer(
	{
		workspaceId,
		placeholder,
		onSubmit,
		onQuickKey,
		attachmentTarget,
		allowAttachments,
		slashCommands,
		sessionTabs,
		onSessionTabPress,
		onSessionTabClose,
		onSessionTabCopyId,
		onNewSessionPress,
		onAllSessionsPress,
		quickKeysAction,
		onQuickKeysActionPress,
		onActiveChange,
		onHeightChange,
		selectActive,
		selectHasSelection,
		onCopySelection,
	},
	ref,
) {
	const { t } = useLingui();
	const composerRef = useRef<ComposerHandle>(null);
	// The screen owns the tap-to-dismiss target over the terminal, so it needs
	// the composer's blur: `Keyboard.dismiss()` alone cannot lower the keyboard,
	// the SwiftUI field sits outside React Native's responder chain.
	useImperativeHandle(ref, () => ({
		focus: () => composerRef.current?.focus(),
		blur: () => composerRef.current?.blur(),
		clear: () => composerRef.current?.clear(),
		appendDraft: (text: string) => composerRef.current?.appendDraft(text),
	}));

	const draftKey = workspaceDraftKey(workspaceId);
	const draft = useComposerDraft(draftKey);
	const openAttachmentsSheet = useAttachmentsSheet(draftKey);
	const addPasted = usePasteAttachments(draftKey);

	// What was typed here last time, pinned at mount: a starting value handed to
	// the composer as it is set up, never a binding.
	const [initialDraft] = useState(() => draft.readText());
	const wasExpanded = useRef(false);
	const writeAttachments = useWriteTerminalAttachments();
	const [isSubmitting, setIsSubmitting] = useState(false);

	const quickKeys: ComposerQuickKey[] = selectActive
		? selectHasSelection
			? [
					{
						id: COPY_SELECTION_KEY,
						label: t({
							message: "Copy Selection",
						}),
					},
				]
			: []
		: QUICK_KEYS.map((key) => ({
				id: key.id,
				label: key.label,
				symbol: key.symbol,
				divider: key.divider,
			}));

	const submit = async ({ text, attachments: files }: PromptInputMessage) => {
		let body = text;
		// The tray is shared across tabs, so files attached in an agent session
		// are still there after switching to a plain shell — which would execute
		// the paths rather than read them. `allowAttachments` has to gate the
		// submit, not just the `+` button.
		if (allowAttachments && files.length > 0) {
			if (!attachmentTarget) {
				Alert.alert(
					t({
						message: "Attachments need an online host",
					}),
				);
				return;
			}
			// A PTY takes bytes, not files: the agent gets the attachments as
			// worktree-relative paths appended to the message. The hook alerts on
			// its own failures.
			const paths = await writeAttachments
				.mutateAsync({ target: attachmentTarget, attachments: files })
				.catch(() => null);
			if (!paths) return;
			body = text ? `${text}\n\n${paths.join("\n")}` : paths.join("\n");
		}
		setIsSubmitting(true);
		try {
			await onSubmit(body);
			posthog.capture("terminal_rich_input_submitted", {
				workspace_id: workspaceId,
				message_length: text.trim().length,
				line_count: text.split("\n").length,
				has_attachments: allowAttachments && files.length > 0,
				attachment_count: allowAttachments ? files.length : 0,
			});
			// Clear what actually went out, and only that. The text always did.
			// The tray only did if this session could carry it — a plain shell
			// submits without attachments, and the draft belongs to the workspace
			// rather than to one terminal, so clearing here would delete an image
			// attached in an agent session that this send never sent.
			composerRef.current?.clear();
			if (allowAttachments) draft.clear();
			else draft.setText("");
		} catch (cause) {
			Alert.alert(
				t({ message: "Could not send" }),
				cause instanceof Error ? cause.message : String(cause),
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<View>
			<Composer
				ref={composerRef}
				placeholder={
					placeholder ??
					t({
						message: "Type a message...",
					})
				}
				initialDraft={initialDraft}
				// The transcript stays live behind the composer: reading the scrollback
				// while typing the next command is the whole point of this screen.
				backdrop="passthrough"
				autocapitalization="never"
				showAttachments={allowAttachments}
				quickKeys={quickKeys}
				sessionTabs={sessionTabs}
				// Translated here because the composer has no catalog of its own.
				sessionTabLabels={{
					copyId: t({
						message: "Copy session ID",
					}),
					close: t({
						message: "Close session",
					}),
					newSession: t({
						message: "New session",
					}),
					allSessions: t({
						message: "Manage sessions",
					}),
					scrollToStart: t({
						message: "Scroll to the first session",
					}),
				}}
				onSessionTabPress={onSessionTabPress}
				onSessionTabClose={onSessionTabClose}
				onSessionTabCopyId={onSessionTabCopyId}
				onNewSessionPress={onNewSessionPress}
				onAllSessionsPress={onAllSessionsPress}
				quickKeysAction={quickKeysAction}
				onQuickKeysActionPress={onQuickKeysActionPress}
				slashCommands={slashCommands.map(
					(command): ComposerSlashCommand => ({
						id: `${command.trigger}${command.name}`,
						name: command.name,
						descriptionText: command.description || undefined,
						trigger: command.trigger,
						argumentHint: command.argumentHint || undefined,
						isBuiltin: command.kind === "builtin" || undefined,
						aliases: command.aliases.length > 0 ? command.aliases : undefined,
					}),
				)}
				isSending={writeAttachments.isPending || isSubmitting}
				// Hidden in a plain shell rather than shown and silently dropped: the
				// draft is the workspace's, so a tray filled in an agent session is
				// still there after switching, and submit will not send it.
				attachments={
					allowAttachments
						? draft.attachments.map((item) => ({
								id: item.id,
								uri: item.uri ?? "",
								kind:
									item.type === "image"
										? ("image" as const)
										: ("file" as const),
								name: item.name,
							}))
						: []
				}
				onSubmit={(text) => submit({ text, attachments: draft.attachments })}
				onDraftChange={draft.setText}
				onRemoveAttachment={(id) => draft.remove(id)}
				onHeightChange={onHeightChange}
				onExpandedChange={(expanded) => {
					wasExpanded.current = expanded;
					onActiveChange?.(expanded);
				}}
				onPaste={addPasted}
				onAttachmentsPress={() => {
					const restore = wasExpanded.current;
					openAttachmentsSheet({
						onClosed: () => {
							if (restore) composerRef.current?.focus();
						},
					});
				}}
				onQuickKeyPress={(id) => {
					if (id === COPY_SELECTION_KEY) {
						onCopySelection();
						return;
					}
					const key = QUICK_KEYS.find((candidate) => candidate.id === id);
					if (key) onQuickKey(key);
				}}
				onDictationError={(message: string) => Alert.alert(message)}
			/>
		</View>
	);
});

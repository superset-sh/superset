import {
	Composer,
	type ComposerHandle,
	type ComposerQuickKey,
} from "@superset/composer";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Alert, View } from "react-native";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { usePromptInputAttachments } from "@/components/ai-elements/prompt-input";
import { useAttachmentsSheet } from "@/screens/(authenticated)/hooks/useAttachmentsSheet";
import { QUICK_KEYS, type TerminalQuickKey } from "./constants";
import {
	type TerminalAttachmentTarget,
	useWriteTerminalAttachments,
} from "./hooks/useWriteTerminalAttachments";

/** Copy Selection replaces the whole strip while a selection is live. */
const COPY_SELECTION_KEY = "copy-selection";

interface TerminalComposerProps {
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
		placeholder = "Type a message...",
		onSubmit,
		onQuickKey,
		attachmentTarget,
		allowAttachments,
		onActiveChange,
		onHeightChange,
		selectActive,
		selectHasSelection,
		onCopySelection,
	},
	ref,
) {
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

	const attachments = usePromptInputAttachments();
	const openAttachmentsSheet = useAttachmentsSheet();
	const wasExpanded = useRef(false);
	const writeAttachments = useWriteTerminalAttachments();
	const [isSubmitting, setIsSubmitting] = useState(false);

	const quickKeys: ComposerQuickKey[] = selectActive
		? selectHasSelection
			? [{ id: COPY_SELECTION_KEY, label: "Copy Selection" }]
			: []
		: QUICK_KEYS.map((key) => ({
				id: key.id,
				label: key.label,
				symbol: key.symbol,
			}));

	const submit = async ({ text, attachments: files }: PromptInputMessage) => {
		let body = text;
		// The tray is shared across tabs, so files attached in an agent session
		// are still there after switching to a plain shell — which would execute
		// the paths rather than read them. `allowAttachments` has to gate the
		// submit, not just the `+` button.
		if (allowAttachments && files.length > 0) {
			if (!attachmentTarget) {
				Alert.alert("Attachments need an online host");
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
			composerRef.current?.clear();
		} catch (cause) {
			Alert.alert(
				"Could not send",
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
				placeholder={placeholder}
				// The transcript stays live behind the composer: reading the scrollback
				// while typing the next command is the whole point of this screen.
				backdrop="passthrough"
				autocapitalization="never"
				showAttachments={allowAttachments}
				quickKeys={quickKeys}
				isSending={writeAttachments.isPending || isSubmitting}
				attachments={attachments.attachments.map((item) => ({
					id: item.id,
					uri: item.uri ?? "",
					kind: item.type === "image" ? ("image" as const) : ("file" as const),
					name: item.name,
				}))}
				onSubmit={(text) =>
					submit({ text, attachments: attachments.attachments })
				}
				onRemoveAttachment={(id) => attachments.remove(id)}
				onHeightChange={onHeightChange}
				onExpandedChange={(expanded) => {
					wasExpanded.current = expanded;
					onActiveChange?.(expanded);
				}}
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

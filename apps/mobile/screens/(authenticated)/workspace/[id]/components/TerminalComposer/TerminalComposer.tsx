import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Alert, View } from "react-native";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import {
	GlassComposer,
	type GlassComposerHandle,
} from "@/screens/(authenticated)/components/GlassComposer";
import { QuickKeysRow } from "./components/QuickKeysRow";
import type { TerminalQuickKey } from "./constants";
import {
	type TerminalAttachmentTarget,
	useWriteTerminalAttachments,
} from "./hooks/useWriteTerminalAttachments";

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
	/** Terminal select mode: swaps the quick keys for Copy Selection / close. */
	selectActive: boolean;
	selectHasSelection: boolean;
	onCopySelection: () => void;
}

/**
 * Terminal input: the shared glass composer with the terminal's own chrome —
 * quick keys (esc/tab/arrows) floating above the pill, and a submit that
 * frames the draft for a live PTY. The project/branch/agent pickers are the
 * home composer's alone; the + button, mic and send are shared.
 */
export const TerminalComposer = forwardRef<
	GlassComposerHandle,
	TerminalComposerProps
>(function TerminalComposer(
	{
		placeholder = "Type a message...",
		onSubmit,
		onQuickKey,
		attachmentTarget,
		allowAttachments,
		onActiveChange,
		selectActive,
		selectHasSelection,
		onCopySelection,
	},
	ref,
) {
	const composerRef = useRef<GlassComposerHandle>(null);
	// The screen owns the tap-to-dismiss target over the terminal, so it needs
	// the composer's blur: Keyboard.dismiss() alone can't lower the keyboard,
	// the SwiftUI field sits outside RN's responder chain.
	useImperativeHandle(ref, () => ({
		focus: () => composerRef.current?.focus(),
		blur: () => composerRef.current?.blur(),
		clear: () => composerRef.current?.clear(),
	}));
	const writeAttachments = useWriteTerminalAttachments();

	const [isSubmitting, setIsSubmitting] = useState(false);

	const submit = async ({ text, attachments }: PromptInputMessage) => {
		let body = text;
		if (attachments.length > 0) {
			if (!attachmentTarget) {
				Alert.alert("Attachments need an online host");
				return;
			}
			// A PTY takes bytes, not files: the agent gets the attachments as
			// worktree-relative paths appended to the message. The hook alerts on
			// its own failures.
			const paths = await writeAttachments
				.mutateAsync({ target: attachmentTarget, attachments })
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
		<View className="px-3 pb-2">
			<GlassComposer
				ref={composerRef}
				above={
					<QuickKeysRow
						onKey={onQuickKey}
						select={
							selectActive
								? {
										hasSelection: selectHasSelection,
										onCopy: onCopySelection,
									}
								: null
						}
					/>
				}
				isSending={writeAttachments.isPending || isSubmitting}
				showAttachments={allowAttachments}
				textInputAutocapitalization="never"
				onActiveChange={onActiveChange}
				onSubmit={submit}
				placeholder={placeholder}
			/>
		</View>
	);
});

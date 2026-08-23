import { requireNativeView } from "expo";
import { forwardRef, type Ref, useImperativeHandle, useRef } from "react";

/** The imperative surface the native view exposes through its ref. */
interface NativeComposerRef {
	clear: () => void;
	appendDraft: (text: string) => void;
	focus: () => void;
	blur: () => void;
}

interface NativeComposerViewProps {
	ref?: Ref<NativeComposerRef>;
	placeholder?: string;
	initialDraft?: string;
	backdrop?: ComposerBackdrop;
	attachments?: ComposerAttachment[];
	selectedModel?: ComposerMenuOption;
	headerChips?: ComposerMenuOption[];
	quickKeys?: ComposerQuickKey[];
	showAttachments?: boolean;
	autocapitalization?: "sentences" | "never";
	isSending?: boolean;
	onSubmit?: (event: { nativeEvent: { text: string } }) => void;
	onAttachmentsPress?: () => void;
	onDictationError?: (event: { nativeEvent: { message: string } }) => void;
	onModelPress?: () => void;
	onChipPress?: (event: { nativeEvent: { id: string } }) => void;
	onQuickKeyPress?: (event: { nativeEvent: { id: string } }) => void;
	onHeightChange?: (event: { nativeEvent: { height: number } }) => void;
	onPaste?: (event: { nativeEvent: { items: ComposerPastedItem[] } }) => void;
	onDraftChange?: (event: { nativeEvent: { text: string } }) => void;
	onRemoveAttachment?: (event: { nativeEvent: { id: string } }) => void;
	onAttachmentPress?: (event: { nativeEvent: { id: string } }) => void;
	onExpandedChange?: (event: { nativeEvent: { expanded: boolean } }) => void;
}

const NativeComposerView =
	requireNativeView<NativeComposerViewProps>("Composer");

/**
 * How the composer treats the screen behind it while expanded.
 *
 * `dim` matches the mocks: the composer owns the screen and an outside tap
 * dismisses it. `passthrough` leaves the content behind live so it can be
 * scrolled while the keyboard is up — what a chat transcript wants. In that
 * mode the caller owns dismissal, since nothing intercepts the outside tap.
 */
export type ComposerBackdrop = "dim" | "passthrough";

/**
 * One entry in a composer picker.
 *
 * `iconUri` may be a remote URL or a local file URI. What it must not be is a
 * Metro asset reference — SwiftUI cannot read those. Resolve bundled art with
 * `expo-asset` first; see `useAgentIconUri`.
 */
export interface ComposerMenuOption {
	id: string;
	label: string;
	iconUri?: string;
	/**
	 * Lead with a project avatar. Separate from `iconUri` because most projects
	 * have no logo and the app draws their initial instead of leaving a gap —
	 * the same thing `ProjectAvatar` does everywhere else.
	 */
	avatar?: boolean;
	/**
	 * Render a step back, as a qualifier rather than as the subject. The branch
	 * belongs to the project name beside it and should not compete with it.
	 */
	muted?: boolean;
}

/**
 * One item in the composer's tray. The tray stays in React Native — it is
 * shared with the attachments sheet — so the composer renders a description of
 * it and reports removals and taps back out.
 */
export interface ComposerAttachment {
	id: string;
	uri: string;
	kind: "image" | "file";
	/**
	 * Shown on the file card. Documents are unidentifiable without it — they all
	 * draw the same glyph. Ignored for images, which show themselves.
	 */
	name?: string;
}

/**
 * One key in the strip above the composer — the terminal's esc/tab/arrows.
 *
 * Deliberately carries no behaviour: what a key writes into the PTY stays with
 * the terminal that owns it. The composer draws the mark and reports the id.
 */
export interface ComposerQuickKey {
	id: string;
	/** Monospaced label. Ignored when `symbol` is set. */
	label?: string;
	/** SF Symbol name, e.g. `arrow.up`. */
	symbol?: string;
}

/**
 * A file or image pasted into the field, already written to disk by the native
 * side — the tray takes URIs, the same shape the pickers produce.
 */
export interface ComposerPastedItem {
	uri: string;
	name: string;
	kind: "image" | "file";
}

export interface ComposerHandle {
	/** Empties the draft. */
	clear: () => void;
	/**
	 * Appends to the draft, for dictation. The composer owns the base text and
	 * does the join, so callers never have to read it back.
	 */
	appendDraft: (text: string) => void;
	/**
	 * Re-opens the composer after something else took first responder — an
	 * attachments sheet, a picker — bringing the keyboard and draft back.
	 */
	focus: () => void;
	blur: () => void;
}

export interface ComposerProps {
	placeholder?: string;
	/**
	 * Whatever this surface had typed when it was last open, put back as the
	 * composer is set up. Read once by the caller and never changed after: this
	 * is a starting value, not a binding, and the composer owns its text from
	 * here on. There is deliberately no `value` prop — see `onDraftChange`.
	 */
	initialDraft?: string;
	backdrop?: ComposerBackdrop;
	attachments?: ComposerAttachment[];
	/**
	 * The selected agent, shown as brand mark + name. Omit to hide the picker —
	 * what the terminal surface wants. The list itself stays in React Native:
	 * the real pickers are `formSheet` routes with searchable lists.
	 */
	selectedModel?: ComposerMenuOption;
	/** Frame 4's header row. Empty on the session surface (frame 13). */
	headerChips?: ComposerMenuOption[];
	/**
	 * Keys above the card — the terminal's esc/tab/arrows. Rendered natively
	 * rather than by the caller: as a React Native sibling the gap to the card
	 * had to guess a height it could not measure, and drifted every time the
	 * card grew.
	 */
	quickKeys?: ComposerQuickKey[];
	/**
	 * Offer the `+` button. A plain shell would try to *execute* an attachment
	 * path, so only agent sessions get it.
	 */
	showAttachments?: boolean;
	/** `never` for the terminal — a shell command is not a sentence. */
	autocapitalization?: "sentences" | "never";
	/**
	 * A submit is in flight. Send becomes a grey spinner and the mic steps
	 * aside. The caller owns this because only it knows when delivery finished.
	 */
	isSending?: boolean;
	/**
	 * Never clears the composer — the caller clears through the ref once its own
	 * delivery succeeded, so a failed send keeps the draft.
	 */
	onSubmit?: (text: string) => void;
	onAttachmentsPress?: () => void;
	/**
	 * Dictation runs natively — the composer owns the recogniser, the permission
	 * prompt and the append — so there is no press to handle here. This only
	 * surfaces a failure so the caller can show its own alert.
	 */
	onDictationError?: (message: string) => void;
	onModelPress?: () => void;
	onChipPress?: (id: string) => void;
	onQuickKeyPress?: (id: string) => void;
	/**
	 * How much room the composer occupies above the bottom safe area — card,
	 * quick keys and the gaps between them.
	 *
	 * The composer draws in an overlay and takes no layout space, so a caller
	 * with content underneath cannot measure it. Excludes the keyboard, which
	 * the caller already tracks and gets a duration and curve for.
	 */
	onHeightChange?: (height: number) => void;
	/**
	 * Files and images pasted into the field. A plain text field only ever takes
	 * strings, so the composer owns its text view to offer Paste for these and
	 * writes them out; adding them to the tray is the caller's job, because the
	 * tray is the caller's.
	 */
	onPaste?: (items: ComposerPastedItem[]) => void;
	/**
	 * Every keystroke, so a caller can keep a shadow copy of the draft and put
	 * it back later. Outward only, like `onHeightChange`: the composer owns its
	 * text while it is live and takes nothing back mid-edit, which is why there
	 * is no `value` prop. Restore through the ref at mount instead.
	 */
	onDraftChange?: (text: string) => void;
	onRemoveAttachment?: (id: string) => void;
	/**
	 * Fires only for non-image attachments. Images open in the composer's own
	 * full-screen viewer — it already holds the URI, so routing the tap out and
	 * back would buy nothing — but only the app knows what to do with a document.
	 */
	onAttachmentPress?: (id: string) => void;
	/**
	 * Fires whenever the composer opens or closes. Callers need it to restore
	 * the composer only when it was actually open — re-focusing unconditionally
	 * after a sheet pops the keyboard back up over a collapsed composer.
	 */
	onExpandedChange?: (expanded: boolean) => void;
}

/**
 * The native composer. Renders nothing in the React Native layout — it mounts a
 * full-screen overlay over the screen's own view controller and draws there, so
 * callers reserve room for the collapsed pill with a content inset rather than
 * with layout.
 *
 * Every surface-specific difference arrives as data, never as children: the
 * moment a `ReactNode` crosses this boundary the seam artifacts that made
 * `GlassComposer` unmaintainable come back with it. See
 * `plans/20260821-native-composer.md`.
 */
export const Composer = forwardRef<ComposerHandle, ComposerProps>(
	function Composer(
		{
			placeholder = "",
			initialDraft = "",
			backdrop = "dim",
			attachments,
			selectedModel,
			headerChips,
			quickKeys,
			showAttachments = true,
			autocapitalization = "sentences",
			isSending = false,
			onSubmit,
			onAttachmentsPress,
			onDictationError,
			onModelPress,
			onChipPress,
			onQuickKeyPress,
			onHeightChange,
			onPaste,
			onDraftChange,
			onRemoveAttachment,
			onAttachmentPress,
			onExpandedChange,
		},
		ref,
	) {
		const nativeRef = useRef<NativeComposerRef>(null);

		useImperativeHandle(ref, () => ({
			clear: () => nativeRef.current?.clear(),
			appendDraft: (text: string) => nativeRef.current?.appendDraft(text),
			focus: () => nativeRef.current?.focus(),
			blur: () => nativeRef.current?.blur(),
		}));

		return (
			<NativeComposerView
				ref={nativeRef}
				placeholder={placeholder}
				initialDraft={initialDraft}
				backdrop={backdrop}
				attachments={attachments}
				selectedModel={selectedModel}
				headerChips={headerChips}
				quickKeys={quickKeys}
				showAttachments={showAttachments}
				autocapitalization={autocapitalization}
				isSending={isSending}
				onSubmit={(event) => onSubmit?.(event.nativeEvent.text)}
				onAttachmentsPress={onAttachmentsPress}
				onDictationError={(event) =>
					onDictationError?.(event.nativeEvent.message)
				}
				onModelPress={onModelPress}
				onChipPress={(event) => onChipPress?.(event.nativeEvent.id)}
				onQuickKeyPress={(event) => onQuickKeyPress?.(event.nativeEvent.id)}
				onHeightChange={(event) => onHeightChange?.(event.nativeEvent.height)}
				onPaste={(event) => onPaste?.(event.nativeEvent.items)}
				onDraftChange={(event) => onDraftChange?.(event.nativeEvent.text)}
				onRemoveAttachment={(event) =>
					onRemoveAttachment?.(event.nativeEvent.id)
				}
				onAttachmentPress={(event) => onAttachmentPress?.(event.nativeEvent.id)}
				onExpandedChange={(event) =>
					onExpandedChange?.(event.nativeEvent.expanded)
				}
			/>
		);
	},
);

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
	sessionTabs?: ComposerSessionTab[];
	sessionTabLabels?: ComposerSessionTabLabels;
	/** Null, never undefined — see the pass-through below. */
	sessionAction?: ComposerSessionAction | null;
	slashCommands?: ComposerSlashCommand[];
	showAttachments?: boolean;
	autocapitalization?: "sentences" | "never";
	isSending?: boolean;
	onSubmit?: (event: { nativeEvent: { text: string } }) => void;
	onAttachmentsPress?: () => void;
	onDictationError?: (event: { nativeEvent: { message: string } }) => void;
	onModelPress?: () => void;
	onChipPress?: (event: { nativeEvent: { id: string } }) => void;
	onQuickKeyPress?: (event: { nativeEvent: { id: string } }) => void;
	onSessionTabPress?: (event: { nativeEvent: { id: string } }) => void;
	onSessionTabClose?: (event: { nativeEvent: { id: string } }) => void;
	onSessionTabCopyId?: (event: { nativeEvent: { id: string } }) => void;
	onNewSessionPress?: () => void;
	onAllSessionsPress?: () => void;
	onSessionActionPress?: () => void;
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
	/**
	 * A hairline between groups rather than a key. Which keys belong together
	 * is the terminal's knowledge, so it arrives as data — but a divider still
	 * needs its own unique `id`, because the strip identifies entries by it.
	 */
	divider?: boolean;
}

/**
 * One session in the strip above the quick keys — the workspace's tab bar.
 *
 * Data only, like the quick keys: the composer draws a pill and reports which
 * one was touched. Everything about what a session *is* stays with the caller.
 */
export interface ComposerSessionTab {
	id: string;
	label: string;
	/**
	 * The agent's brand mark. Same rule as `ComposerMenuOption.iconUri`: a
	 * remote URL or a local file URI, never a Metro asset reference. Resolve
	 * bundled art with `expo-asset` first — see `useAgentIconUris`. Omit for a
	 * plain shell, which draws the session's initial instead.
	 */
	iconUri?: string;
	selected?: boolean;
	/** Desktop's StatusIndicator states; omit for a session with nothing to say. */
	attention?: "permission" | "working" | "failed" | "review";
}

/**
 * The one static control at the head of the session strip.
 *
 * Data only, like everything else in this row: the composer draws a chip and
 * says it was pressed. What it opens is the caller's to know — the workspace
 * terminal points it at that workspace's pull requests, and nothing here names
 * one.
 *
 * It holds still while the tabs scroll under it, so a strip long enough to
 * scroll never carries it out of reach.
 */
export interface ComposerSessionAction {
	/** SF Symbol name, e.g. `arrow.triangle.pull`. */
	symbol: string;
	/**
	 * A mark to draw instead of `symbol`. Same rule as
	 * `ComposerSessionTab.iconUri`: a local file URI, never a Metro asset
	 * reference. Drawn as a template, so it takes `tint` like the symbol does,
	 * and `symbol` shows until it resolves.
	 */
	iconUri?: string;
	/**
	 * Which accent the glyph takes. Omit for the same foreground the strip's
	 * other controls use. The name crosses the bridge and the composer owns the
	 * colour, the way `ComposerSessionTab.attention` does.
	 */
	tint?: "open" | "draft" | "queued" | "merged" | "closed";
	/** Accessibility label. Translated here; the composer has no catalog. */
	label: string;
}

/**
 * Every user-facing string the tab strip draws.
 *
 * They cross the bridge because the composer cannot translate — Lingui's macros
 * and catalogs live here — and a hardcoded English menu item would be the one
 * untranslated string on a translated screen.
 */
export interface ComposerSessionTabLabels {
	/** Context menu: copies the session's id to the pasteboard. */
	copyId: string;
	/** Context menu, destructive, and the close disc's accessibility label. */
	close: string;
	newSession: string;
	allSessions: string;
	scrollToStart: string;
}

/**
 * One slash command or skill the active agent can run — the suggestion panel
 * above the composer. Data only, like the quick keys: selection replaces the
 * draft natively and reports back through `onDraftChange`.
 */
export interface ComposerSlashCommand {
	id: string;
	/** Full display name, namespace included (`agent-sdk-dev:new-sdk-app`). */
	name: string;
	descriptionText?: string;
	/** The sigil that opens and commits this entry: `/`, or `$` for Codex skills. */
	trigger: "/" | "$";
	/** Non-empty when the command takes arguments; a fully typed command with
	 *  arguments keeps the panel closed so they can be typed in peace. */
	argumentHint?: string;
	/** Harness-shipped commands sort after user-defined ones, like desktop. */
	isBuiltin?: boolean;
	/** Alternate names; matched after the canonical name, like desktop. */
	aliases?: string[];
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

/**
 * The strip and its strings arrive together or not at all.
 *
 * Split out of the props rather than left as two optional fields: the composer
 * cannot translate, so tabs without labels render a context menu and
 * accessibility labels that are empty strings — a caller can reach that state
 * without any type error, and nothing about it looks wrong until VoiceOver
 * reaches it.
 */
type ComposerSessionTabsProps =
	| {
			sessionTabs: ComposerSessionTab[];
			sessionTabLabels: ComposerSessionTabLabels;
	  }
	| { sessionTabs?: undefined; sessionTabLabels?: undefined };

export type ComposerProps = ComposerBaseProps & ComposerSessionTabsProps;

interface ComposerBaseProps {
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
	 * The one static control at the head of the session strip. Omitted on every
	 * surface with nothing to link to — which is all of them but the workspace
	 * terminal. Independent of `sessionTabs`: an action with no sessions yet
	 * still draws the row it belongs to.
	 */
	sessionAction?: ComposerSessionAction;
	/**
	 * What the active agent can run behind `/` (or `$`). Empty or omitted
	 * hides the suggestion panel — a plain shell, an agent without command
	 * discovery, or a host too old to answer all look the same here.
	 */
	slashCommands?: ComposerSlashCommand[];
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
	/** A tab was tapped — attach that session. */
	onSessionTabPress?: (id: string) => void;
	/**
	 * Close was chosen, from the selected tab's disc or the press-and-hold
	 * menu. Nothing has been killed yet: the composer has no idea what closing
	 * costs, so the caller confirms.
	 */
	onSessionTabClose?: (id: string) => void;
	/**
	 * Copy id was chosen from the press-and-hold menu. The caller owns the
	 * pasteboard write and whatever it shows afterwards, so the confirmation
	 * matches every other copy on the screen.
	 */
	onSessionTabCopyId?: (id: string) => void;
	onNewSessionPress?: () => void;
	onAllSessionsPress?: () => void;
	/**
	 * The leading control was pressed. Only ever fires when `sessionAction` is
	 * set, so the caller that provided the chip is the one that hears about it.
	 */
	onSessionActionPress?: () => void;
	/**
	 * How much room the composer occupies above the bottom safe area — the
	 * session tabs, the card, the quick keys and the gaps between them.
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
			sessionTabs,
			sessionTabLabels,
			sessionAction,
			slashCommands,
			showAttachments = true,
			autocapitalization = "sentences",
			isSending = false,
			onSubmit,
			onAttachmentsPress,
			onDictationError,
			onModelPress,
			onChipPress,
			onQuickKeyPress,
			onSessionTabPress,
			onSessionTabClose,
			onSessionTabCopyId,
			onNewSessionPress,
			onAllSessionsPress,
			onSessionActionPress,
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
				sessionTabs={sessionTabs}
				sessionTabLabels={sessionTabLabels}
				// Null rather than undefined: React Native drops undefined props
				// before they reach the view, so the native setter is never called
				// and a chip that has gone away stays on screen.
				sessionAction={sessionAction ?? null}
				slashCommands={slashCommands}
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
				onSessionTabPress={(event) => onSessionTabPress?.(event.nativeEvent.id)}
				onSessionTabClose={(event) => onSessionTabClose?.(event.nativeEvent.id)}
				onSessionTabCopyId={(event) =>
					onSessionTabCopyId?.(event.nativeEvent.id)
				}
				onNewSessionPress={onNewSessionPress}
				onAllSessionsPress={onAllSessionsPress}
				onSessionActionPress={onSessionActionPress}
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

import { requireNativeView } from "expo";
import { forwardRef, type Ref, useImperativeHandle, useRef } from "react";

/** The imperative surface the native view exposes through its ref. */
interface NativeComposerRef {
	clear: () => void;
	focus: () => void;
	blur: () => void;
}

interface NativeComposerViewProps {
	ref?: Ref<NativeComposerRef>;
	placeholder?: string;
	backdrop?: ComposerBackdrop;
	attachments?: ComposerAttachment[];
	onSubmit?: (event: { nativeEvent: { text: string } }) => void;
	onAttachmentsPress?: () => void;
	onDictatePress?: () => void;
	onModelPress?: () => void;
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
 * One item in the composer's tray. The tray itself stays in React Native — it
 * is shared with the attachments sheet — so the composer renders a description
 * of it and reports removals and taps back out.
 */
export interface ComposerAttachment {
	id: string;
	uri: string;
	kind: "image" | "file";
}

export interface ComposerHandle {
	/** Empties the draft. */
	clear: () => void;
	/**
	 * Re-opens the composer after something else took first responder — an
	 * attachments sheet, a picker — bringing the keyboard and draft back.
	 */
	focus: () => void;
	blur: () => void;
}

export interface ComposerProps {
	placeholder?: string;
	backdrop?: ComposerBackdrop;
	attachments?: ComposerAttachment[];
	/**
	 * Never clears the composer — the caller clears through the ref once its own
	 * delivery succeeded, so a failed send keeps the draft.
	 */
	onSubmit?: (text: string) => void;
	onAttachmentsPress?: () => void;
	onDictatePress?: () => void;
	onModelPress?: () => void;
	onRemoveAttachment?: (id: string) => void;
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
			backdrop = "dim",
			attachments,
			onSubmit,
			onAttachmentsPress,
			onDictatePress,
			onModelPress,
			onRemoveAttachment,
			onAttachmentPress,
			onExpandedChange,
		},
		ref,
	) {
		const nativeRef = useRef<NativeComposerRef>(null);

		useImperativeHandle(ref, () => ({
			clear: () => nativeRef.current?.clear(),
			focus: () => nativeRef.current?.focus(),
			blur: () => nativeRef.current?.blur(),
		}));

		return (
			<NativeComposerView
				ref={nativeRef}
				placeholder={placeholder}
				backdrop={backdrop}
				attachments={attachments}
				onSubmit={(event) => onSubmit?.(event.nativeEvent.text)}
				onAttachmentsPress={onAttachmentsPress}
				onDictatePress={onDictatePress}
				onModelPress={onModelPress}
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

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
	onSubmit?: (event: { nativeEvent: { text: string } }) => void;
	onAttachmentsPress?: () => void;
	onDictatePress?: () => void;
	onModelPress?: () => void;
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
	/**
	 * Never clears the composer — the caller clears through the ref once its own
	 * delivery succeeded, so a failed send keeps the draft.
	 */
	onSubmit?: (text: string) => void;
	onAttachmentsPress?: () => void;
	onDictatePress?: () => void;
	onModelPress?: () => void;
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
			onSubmit,
			onAttachmentsPress,
			onDictatePress,
			onModelPress,
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
				onSubmit={(event) => onSubmit?.(event.nativeEvent.text)}
				onAttachmentsPress={onAttachmentsPress}
				onDictatePress={onDictatePress}
				onModelPress={onModelPress}
			/>
		);
	},
);

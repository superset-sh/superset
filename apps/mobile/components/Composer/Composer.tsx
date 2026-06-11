import {
	KeyboardAvoidingView,
	Platform,
	View,
	type ViewProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
	ComposerRow,
	type ComposerRowProps,
	type ComposerRowVariant,
} from "@/components/ComposerRow";
import { cn } from "@/lib/utils";

export type ComposerState = ComposerRowVariant | "disabled" | "hidden";

export type ComposerProps = Omit<ViewProps, "children"> & {
	state?: ComposerState;
	rowProps?: Omit<ComposerRowProps, "variant">;
	/** Override automatic keyboard offset (default 0). */
	keyboardVerticalOffset?: number;
};

/**
 * Composer organism — Keyboard-avoiding shell around ComposerRow.
 *
 * Coordinates:
 *  - Bottom safe-area inset (so the input doesn't sit under the home indicator)
 *  - Platform-appropriate KeyboardAvoidingView behavior
 *  - Suppression: `hidden` returns null (UC-PAUSE-01 approval overlay swaps it out);
 *    `disabled` renders ComposerRow with editable=false via state mapping
 *  - State mapping: `disabled` maps to ComposerRow's `streaming` (read-only input + stop slot)
 *
 * UC-COMP-01 (idle/typing) · UC-COMP-03 (streaming/sending) · UC-PAUSE-01 (hidden).
 */
export function Composer({
	state = "idle",
	rowProps,
	keyboardVerticalOffset = 0,
	className,
	...props
}: ComposerProps) {
	const insets = useSafeAreaInsets();

	if (state === "hidden") return null;

	const rowVariant: ComposerRowVariant =
		state === "disabled" ? "streaming" : state;

	return (
		<KeyboardAvoidingView
			behavior={Platform.OS === "ios" ? "padding" : "height"}
			keyboardVerticalOffset={keyboardVerticalOffset}
			className={cn("bg-background border-t border-border", className)}
			{...props}
		>
			<View
				style={{ paddingBottom: Math.max(insets.bottom, 8) }}
				className="px-3 pt-3"
			>
				<ComposerRow {...rowProps} variant={rowVariant} />
			</View>
		</KeyboardAvoidingView>
	);
}

import { Pill, type PillProps } from "@/components/Pill";

export type SuggestedAnswerPillVariant = "default" | "accent" | "ghost";

export type SuggestedAnswerPillProps = Omit<
	PillProps,
	"variant" | "interactive" | "label"
> & {
	text: string;
	variant?: SuggestedAnswerPillVariant;
};

/**
 * Tappable pill in the ask_user bottom sheet's suggested-answers horizontal row.
 *
 * Per mol-suggested-answer-pill spec:
 *  - 3 variants: default (neutral) · accent (recommended ember) · ghost (subtle)
 *  - Pill IS the tap zone — Pill `md` already gives 44pt touch height
 *  - aria-label pattern: "Use suggested answer: {text}"
 *
 * Composes first-party Pill in interactive mode.
 */
export function SuggestedAnswerPill({
	text,
	variant = "default",
	onPress,
	disabled,
	...props
}: SuggestedAnswerPillProps) {
	const pillVariant: PillProps["variant"] =
		variant === "accent" ? "accent" : "default";
	const className =
		variant === "ghost" ? "bg-transparent border-border" : undefined;

	return (
		<Pill
			label={text}
			variant={pillVariant}
			size="md"
			interactive
			onPress={onPress}
			disabled={disabled}
			accessibilityLabel={`Use suggested answer: ${text}`}
			className={className}
			{...props}
		/>
	);
}

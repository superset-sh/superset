import { useLingui } from "@lingui/react/macro";
import { XIcon } from "lucide-react";

interface DismissSuggestionsButtonProps {
	onDismiss: () => void;
}

/**
 * Hover-reveal escape hatch on the suggestion surface. Callers gate this behind
 * the user's first real workspace: dismissal permanently removes the surface
 * the prompt-cards experiment measures, so letting the cold-start population
 * reach it would let the treatment erase itself.
 */
export function DismissSuggestionsButton({
	onDismiss,
}: DismissSuggestionsButtonProps) {
	const { t } = useLingui();
	return (
		<button
			type="button"
			aria-label={t({
				message: "Dismiss suggestions",
			})}
			onClick={onDismiss}
			className="absolute -top-2 right-0 z-10 flex size-5 cursor-pointer items-center justify-center rounded-full border-[0.5px] border-border bg-popover text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
		>
			<XIcon className="size-3" />
		</button>
	);
}

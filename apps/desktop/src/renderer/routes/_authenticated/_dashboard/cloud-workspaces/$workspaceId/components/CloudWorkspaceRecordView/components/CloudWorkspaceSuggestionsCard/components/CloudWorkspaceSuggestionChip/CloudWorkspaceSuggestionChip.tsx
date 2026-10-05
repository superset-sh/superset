import { useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { ReactNode } from "react";
import { HiMiniXMark } from "react-icons/hi2";

interface CloudWorkspaceSuggestionChipProps {
	children: ReactNode;
	acceptLabel: string;
	onAccept: () => void;
	onDismiss: () => void;
}

export function CloudWorkspaceSuggestionChip({
	children,
	acceptLabel,
	onAccept,
	onDismiss,
}: CloudWorkspaceSuggestionChipProps) {
	const { t } = useLingui();
	return (
		<span className="group/chip relative inline-flex h-7 max-w-[min(100%,260px)] items-center rounded-full border border-dashed border-muted-foreground/40 hover:border-solid hover:border-muted-foreground/70">
			<Tooltip delayDuration={500}>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={onAccept}
						className="flex min-w-0 items-center gap-1.5 px-2.5 py-1 text-[13px] group-hover/chip:[mask-image:linear-gradient(to_right,black_calc(100%-34px),transparent_calc(100%-26px))] group-has-[:focus-visible]/chip:[mask-image:linear-gradient(to_right,black_calc(100%-34px),transparent_calc(100%-26px))]"
					>
						{children}
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">{acceptLabel}</TooltipContent>
			</Tooltip>
			<button
				type="button"
				onClick={onDismiss}
				aria-label={t({ message: "Dismiss suggestion" })}
				className="absolute top-1/2 right-1 hidden size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground group-hover/chip:flex group-has-[:focus-visible]/chip:flex hover:bg-foreground/10 hover:text-foreground"
			>
				<HiMiniXMark className="size-3.5" />
			</button>
		</span>
	);
}

import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { CSSProperties } from "react";
import type { ComposerChip } from "../PromptInput/types";
import "./chip.css";

export function Chip({
	chip,
	selected,
	mention,
}: {
	chip: Pick<
		ComposerChip,
		"label" | "serialized" | "brandColor" | "iconUrl" | "description"
	>;
	selected?: boolean;
	mention?: boolean;
}) {
	const body = (
		<span
			className="prompt-input-chip"
			data-mention-chip={mention || undefined}
			data-selected={selected || undefined}
			style={
				chip.brandColor
					? ({ "--chip-color": chip.brandColor } as CSSProperties)
					: undefined
			}
		>
			{chip.iconUrl && (
				<span className="prompt-input-chip-icon">
					<img src={chip.iconUrl} alt="" draggable={false} />
				</span>
			)}
			<span className="prompt-input-chip-label">{chip.label}</span>
		</span>
	);
	if (!chip.description && chip.serialized === chip.label) return body;
	return (
		<Tooltip>
			<TooltipTrigger asChild>{body}</TooltipTrigger>
			<TooltipContent className="max-w-xs" side="top">
				<p className="break-all font-mono">{chip.serialized}</p>
				{chip.description && (
					<p className="line-clamp-4 text-muted-foreground">
						{chip.description}
					</p>
				)}
			</TooltipContent>
		</Tooltip>
	);
}

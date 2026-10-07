import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { hexToRgba, isHexColor } from "renderer/lib/project-accent";

interface ProjectThumbnailProps {
	projectName: string;
	iconUrl?: string | null;
	/** Accent color as a `#rrggbb` hex; tints the border and letter fallback. */
	color?: string | null;
	className?: string;
}

export function ProjectThumbnail({
	projectName,
	iconUrl,
	color,
	className,
}: ProjectThumbnailProps) {
	const [failedUrl, setFailedUrl] = useState<string | null>(null);

	const firstLetter = projectName.charAt(0).toUpperCase();
	const hasColor = isHexColor(color);

	if (iconUrl && failedUrl !== iconUrl) {
		return (
			<div
				className={cn(
					"relative size-6 rounded-sm overflow-hidden flex-shrink-0 bg-muted border",
					hasColor ? undefined : "border-foreground/10",
					className,
				)}
				style={hasColor ? { borderColor: hexToRgba(color, 0.6) } : undefined}
			>
				<img
					src={iconUrl}
					alt={`${projectName} icon`}
					className="size-full object-cover"
					onError={() => setFailedUrl(iconUrl)}
				/>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"size-6 rounded-sm flex items-center justify-center flex-shrink-0",
				"text-xs font-medium border",
				hasColor
					? undefined
					: "bg-muted text-muted-foreground border-foreground/10",
				className,
			)}
			style={
				hasColor
					? {
							borderColor: hexToRgba(color, 0.6),
							backgroundColor: hexToRgba(color, 0.15),
							color,
						}
					: undefined
			}
		>
			{firstLetter}
		</div>
	);
}

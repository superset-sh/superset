import { cn } from "@superset/ui/utils";
import { useState } from "react";
import {
	hexToRgba,
	isCustomProjectColor,
} from "shared/constants/project-colors";

interface ProjectThumbnailProps {
	projectName: string;
	iconUrl?: string | null;
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
	const hasCustomColor = isCustomProjectColor(color);
	const customBorderStyle = hasCustomColor
		? { borderColor: hexToRgba(color, 0.6) }
		: undefined;

	if (iconUrl && failedUrl !== iconUrl) {
		return (
			<div
				className={cn(
					"relative size-6 rounded-sm overflow-hidden flex-shrink-0 bg-muted border",
					hasCustomColor ? undefined : "border-foreground/10",
					className,
				)}
				style={customBorderStyle}
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

	const fallbackStyle = hasCustomColor
		? {
				borderColor: hexToRgba(color, 0.6),
				backgroundColor: hexToRgba(color, 0.15),
				color,
			}
		: undefined;

	return (
		<div
			className={cn(
				"size-6 rounded-sm flex items-center justify-center flex-shrink-0",
				"text-xs font-medium border",
				hasCustomColor
					? undefined
					: "bg-muted text-muted-foreground border-foreground/10",
				className,
			)}
			style={fallbackStyle}
		>
			{firstLetter}
		</div>
	);
}

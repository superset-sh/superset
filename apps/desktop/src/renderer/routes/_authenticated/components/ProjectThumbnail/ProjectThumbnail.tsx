import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { PROJECT_COLOR_DEFAULT } from "shared/constants/project-colors";

interface ProjectThumbnailProps {
	projectName: string;
	iconUrl?: string | null;
	color?: string | null;
	className?: string;
}

function hexToRgba(hex: string, alpha: number): string {
	const r = Number.parseInt(hex.slice(1, 3), 16);
	const g = Number.parseInt(hex.slice(3, 5), 16);
	const b = Number.parseInt(hex.slice(5, 7), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function isCustomColor(color: string | null | undefined): color is string {
	return !!color && color !== PROJECT_COLOR_DEFAULT && color.startsWith("#");
}

export function ProjectThumbnail({
	projectName,
	iconUrl,
	color,
	className,
}: ProjectThumbnailProps) {
	const [failedUrl, setFailedUrl] = useState<string | null>(null);

	const firstLetter = projectName.charAt(0).toUpperCase();
	const hasCustomColor = isCustomColor(color);
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

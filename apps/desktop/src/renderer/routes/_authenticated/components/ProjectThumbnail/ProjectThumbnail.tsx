import { cn } from "@superset/ui/utils";
import { useState } from "react";

interface ProjectThumbnailProps {
	projectName: string;
	iconUrl?: string | null;
	/** Accent color as a `#rrggbb` hex; tints the border and letter fallback. */
	color?: string | null;
	className?: string;
}

function hexToRgba(hex: string, alpha: number): string {
	const r = Number.parseInt(hex.slice(1, 3), 16);
	const g = Number.parseInt(hex.slice(3, 5), 16);
	const b = Number.parseInt(hex.slice(5, 7), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Exact #rrggbb only — hexToRgba slices fixed offsets, so anything shorter
// (e.g. #fff) would produce NaN channels. Treat malformed values as unset.
function isHexColor(color: string | null | undefined): color is string {
	return !!color && /^#[0-9a-fA-F]{6}$/.test(color);
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

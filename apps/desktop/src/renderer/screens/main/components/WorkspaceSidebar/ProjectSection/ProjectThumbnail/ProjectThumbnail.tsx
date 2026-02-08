import type { ProjectColorMode } from "@superset/local-db";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { PROJECT_COLOR_DEFAULT } from "shared/constants/project-colors";

interface ProjectThumbnailProps {
	projectId: string;
	projectName: string;
	projectColor: string;
	colorMode?: ProjectColorMode;
	githubOwner: string | null;
	hideImage?: boolean;
	className?: string;
}

function getGitHubAvatarUrl(owner: string): string {
	return `https://github.com/${owner}.png?size=64`;
}

/**
 * Converts a hex color to rgba with the specified alpha.
 */
function hexToRgba(hex: string, alpha: number): string {
	const r = Number.parseInt(hex.slice(1, 3), 16);
	const g = Number.parseInt(hex.slice(3, 5), 16);
	const b = Number.parseInt(hex.slice(5, 7), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Checks if a color value is a custom hex color (not the "default" value).
 */
function isCustomColor(color: string): boolean {
	return color !== PROJECT_COLOR_DEFAULT && color.startsWith("#");
}

function getRelativeLuminance(hex: string): number {
	const toLinear = (c: number) => {
		const sRGB = c / 255;
		return sRGB <= 0.03928 ? sRGB / 12.92 : ((sRGB + 0.055) / 1.055) ** 2.4;
	};
	const r = toLinear(Number.parseInt(hex.slice(1, 3), 16));
	const g = toLinear(Number.parseInt(hex.slice(3, 5), 16));
	const b = toLinear(Number.parseInt(hex.slice(5, 7), 16));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastTextColor(hex: string): string {
	return getRelativeLuminance(hex) > 0.4
		? "rgba(0, 0, 0, 0.85)"
		: "rgba(255, 255, 255, 0.95)";
}

export function ProjectThumbnail({
	projectId,
	projectName,
	projectColor,
	colorMode = "border",
	githubOwner,
	hideImage,
	className,
}: ProjectThumbnailProps) {
	const [imageError, setImageError] = useState(false);

	const { data: avatarData } = electronTrpc.projects.getGitHubAvatar.useQuery(
		{ id: projectId },
		{
			staleTime: 1000 * 60 * 5,
			refetchOnWindowFocus: false,
		},
	);

	const owner = avatarData?.owner ?? githubOwner;
	const firstLetter = projectName.charAt(0).toUpperCase();
	const hasCustomColor = isCustomColor(projectColor);
	const isBackground = colorMode === "background";

	// Border mode: gray by default, custom color with slight transparency when set
	// Background mode: no border
	const borderClasses = cn(
		isBackground ? undefined : "border-[1.5px]",
		!isBackground && !hasCustomColor && "border-border",
	);

	const getBorderStyle = () => {
		if (isBackground || !hasCustomColor) return undefined;
		return { borderColor: hexToRgba(projectColor, 0.6) };
	};

	const borderStyle = getBorderStyle();

	// Show GitHub avatar if available and not hidden
	if (owner && !imageError && !hideImage) {
		return (
			<div
				className={cn(
					"relative size-6 rounded overflow-hidden shrink-0 bg-muted",
					borderClasses,
					className,
				)}
				style={borderStyle}
			>
				<img
					src={getGitHubAvatarUrl(owner)}
					alt={`${projectName} avatar`}
					className="size-full object-cover"
					onError={() => setImageError(true)}
				/>
			</div>
		);
	}

	// Fallback: show first letter with color applied based on colorMode
	const getFallbackStyle = () => {
		if (!hasCustomColor) return borderStyle;

		if (isBackground) {
			return {
				backgroundColor: projectColor,
				color: getContrastTextColor(projectColor),
			};
		}

		return {
			borderColor: hexToRgba(projectColor, 0.6),
			backgroundColor: hexToRgba(projectColor, 0.15),
			color: projectColor,
		};
	};

	const fallbackStyle = getFallbackStyle();

	return (
		<div
			className={cn(
				"size-6 rounded flex items-center justify-center shrink-0",
				"text-xs font-medium",
				!hasCustomColor && "bg-muted text-muted-foreground",
				borderClasses,
				className,
			)}
			style={fallbackStyle}
		>
			{firstLetter}
		</div>
	);
}

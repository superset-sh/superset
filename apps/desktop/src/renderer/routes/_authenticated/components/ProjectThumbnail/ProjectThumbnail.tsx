import { cn } from "@superset/ui/utils";
import { useState } from "react";

interface ProjectThumbnailProps {
	projectName: string;
	githubOwner: string | null;
	className?: string;
}

function getGitHubAvatarUrl(owner: string): string {
	return `https://github.com/${owner}.png?size=64`;
}

export function ProjectThumbnail({
	projectName,
	githubOwner,
	className,
}: ProjectThumbnailProps) {
	const [imageError, setImageError] = useState(false);

	const firstLetter = projectName.charAt(0).toUpperCase();

	if (githubOwner && !imageError) {
		return (
			<div
				className={cn(
					"relative size-6 rounded overflow-hidden flex-shrink-0 bg-muted border-[1.5px] border-border",
					className,
				)}
			>
				<img
					src={getGitHubAvatarUrl(githubOwner)}
					alt={`${projectName} avatar`}
					className="size-full object-cover"
					onError={() => setImageError(true)}
				/>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"size-6 rounded flex items-center justify-center flex-shrink-0",
				"text-xs font-medium bg-muted text-muted-foreground border-[1.5px] border-border",
				className,
			)}
		>
			{firstLetter}
		</div>
	);
}

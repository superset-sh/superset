import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { trpc } from "renderer/lib/trpc";

interface ProjectThumbnailProps {
	projectId: string;
	projectName: string;
	githubOwner: string | null;
	className?: string;
}

function getGitHubAvatarUrl(owner: string): string {
	return `https://github.com/${owner}.png?size=64`;
}

export function ProjectThumbnail({
	projectId,
	projectName,
	githubOwner,
	className,
}: ProjectThumbnailProps) {
	const [imageError, setImageError] = useState(false);

	// Always fetch to ensure we get the latest - the backend caches it
	const { data: avatarData } = trpc.projects.getGitHubAvatar.useQuery(
		{ id: projectId },
		{
			staleTime: 1000 * 60 * 5, // Consider stale after 5 minutes
			refetchOnWindowFocus: false,
		},
	);

	// Prefer fetched data, fall back to prop
	const owner = avatarData?.owner ?? githubOwner;
	const firstLetter = projectName.charAt(0).toUpperCase();

	// Show avatar if we have an owner and no image loading error
	if (owner && !imageError) {
		return (
			<div
				className={cn(
					"relative size-6 rounded overflow-hidden flex-shrink-0 bg-muted",
					className,
				)}
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

	// Fallback: show first letter with subtle background
	return (
		<div
			className={cn(
				"size-6 rounded flex items-center justify-center flex-shrink-0",
				"bg-muted text-muted-foreground text-xs font-medium",
				className,
			)}
		>
			{firstLetter}
		</div>
	);
}

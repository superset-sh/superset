import { cn } from "@superset/ui/utils";
import { useEffect, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface WorkspaceThumbnailProps {
	workspaceId: string;
	workspaceName: string;
	isActive?: boolean;
	className?: string;
}

const IMAGE_STALE_TIME = 5 * 60 * 1000; // 5 minutes

export function WorkspaceThumbnail({
	workspaceId,
	workspaceName,
	isActive = false,
	className,
}: WorkspaceThumbnailProps) {
	const [imageError, setImageError] = useState(false);

	// Reset error state when workspace changes
	useEffect(() => {
		setImageError(false);
	}, [workspaceId]);

	const { data: imageData } =
		electronTrpc.workspaces.getWorkspaceImage.useQuery(
			{ workspaceId },
			{
				staleTime: IMAGE_STALE_TIME,
				refetchOnWindowFocus: false,
			},
		);

	const hasImage =
		imageData?.type !== "fallback" && imageData?.dataUrl && !imageError;

	// Render image if available
	if (hasImage && imageData?.dataUrl) {
		return (
			<div
				className={cn(
					"size-4 rounded overflow-hidden flex-shrink-0",
					className,
				)}
			>
				<img
					src={imageData.dataUrl}
					alt="Workspace icon"
					className="size-full object-cover"
					onError={() => setImageError(true)}
				/>
			</div>
		);
	}

	// Fallback to first letter of workspace name
	const firstLetter = workspaceName.charAt(0).toUpperCase();
	return (
		<div
			className={cn(
				"size-4 rounded flex items-center justify-center flex-shrink-0",
				"bg-muted text-[10px] font-medium",
				isActive ? "text-foreground" : "text-muted-foreground",
				className,
			)}
		>
			{firstLetter}
		</div>
	);
}

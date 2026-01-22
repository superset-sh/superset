import { ContextMenuItem } from "@superset/ui/context-menu";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useEffect, useState } from "react";
import {
	LuAlertCircle,
	LuCheck,
	LuFolder,
	LuLoader,
	LuWand,
} from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface ImagePickerContentProps {
	workspaceId: string;
	currentImagePath: string | null | undefined;
	onSelect: (imagePath: string | null) => void;
}

const _IMAGE_THUMBNAIL_SIZE = 24;

function ImageThumbnail({
	workspaceId,
	imagePath,
	isSelected,
	onSelect,
	disabled,
}: {
	workspaceId: string;
	imagePath: string;
	isSelected: boolean;
	onSelect: () => void;
	disabled?: boolean;
}) {
	const [error, setError] = useState(false);

	const { data: thumbnailData, isLoading } =
		electronTrpc.workspaces.getImageThumbnail.useQuery(
			{ workspaceId, imagePath },
			{
				staleTime: 5 * 60 * 1000,
				refetchOnWindowFocus: false,
			},
		);

	if (isLoading) {
		return (
			<button
				type="button"
				className="size-6 rounded border border-border bg-muted flex items-center justify-center"
				disabled
			>
				<LuLoader className="size-3 animate-spin text-muted-foreground" />
			</button>
		);
	}

	if (error || !thumbnailData?.dataUrl) {
		return null;
	}

	return (
		<button
			type="button"
			onClick={onSelect}
			disabled={disabled}
			className={cn(
				"relative size-6 rounded overflow-hidden border transition-colors",
				isSelected
					? "border-primary ring-1 ring-primary"
					: "border-border hover:border-primary/50",
				disabled && "opacity-50 cursor-not-allowed",
			)}
		>
			<img
				src={thumbnailData.dataUrl}
				alt={imagePath}
				className="size-full object-cover"
				onError={() => setError(true)}
			/>
			{isSelected && (
				<div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
					<LuCheck className="size-3 text-primary" />
				</div>
			)}
		</button>
	);
}

export function ImagePickerContent({
	workspaceId,
	currentImagePath,
	onSelect,
}: ImagePickerContentProps) {
	const utils = electronTrpc.useUtils();

	const {
		data: images,
		isLoading,
		isError: isQueryError,
		error: queryError,
	} = electronTrpc.workspaces.discoverImages.useQuery(
		{ workspaceId },
		{
			staleTime: 30 * 1000, // 30 seconds
			refetchOnWindowFocus: false,
		},
	);

	// Show toast when query fails
	useEffect(() => {
		if (isQueryError && queryError) {
			toast.error(`Failed to discover images: ${queryError.message}`);
		}
	}, [isQueryError, queryError]);

	const setWorkspaceImage =
		electronTrpc.workspaces.setWorkspaceImage.useMutation({
			onSuccess: () => {
				utils.workspaces.getWorkspaceImage.invalidate({ workspaceId });
			},
			onError: (error) => {
				toast.error(`Failed to set image: ${error.message}`);
			},
		});

	const handleSelect = async (imagePath: string | null) => {
		try {
			await setWorkspaceImage.mutateAsync({ workspaceId, imagePath });
			toast.success(
				imagePath === null
					? "Set to auto-detect"
					: imagePath === ""
						? "Set to default icon"
						: "Image updated",
			);
			onSelect(imagePath);
		} catch {
			// Error already handled by onError callback
		}
	};

	const isMutating = setWorkspaceImage.isPending;

	// Auto means null (auto-detect)
	const isAutoSelected =
		currentImagePath === null || currentImagePath === undefined;
	// None means empty string (use fallback icon)
	const isNoneSelected = currentImagePath === "";

	return (
		<div className="p-2 min-w-[200px]">
			{/* Auto and None options */}
			<div className="flex flex-col gap-1 mb-2">
				<ContextMenuItem
					onSelect={() => handleSelect(null)}
					disabled={isMutating}
					className="flex items-center gap-2"
				>
					{isMutating && isAutoSelected ? (
						<LuLoader className="size-4 animate-spin" />
					) : (
						<LuWand className="size-4" />
					)}
					<span className="flex-1">Auto-detect</span>
					{isAutoSelected && !isMutating && (
						<LuCheck className="size-4 text-primary" />
					)}
				</ContextMenuItem>
				<ContextMenuItem
					onSelect={() => handleSelect("")}
					disabled={isMutating}
					className="flex items-center gap-2"
				>
					{isMutating && isNoneSelected ? (
						<LuLoader className="size-4 animate-spin" />
					) : (
						<LuFolder className="size-4" />
					)}
					<span className="flex-1">Default icon</span>
					{isNoneSelected && !isMutating && (
						<LuCheck className="size-4 text-primary" />
					)}
				</ContextMenuItem>
			</div>

			{/* Image grid */}
			{isLoading ? (
				<div className="flex items-center justify-center py-4">
					<LuLoader className="size-4 animate-spin text-muted-foreground" />
					<span className="ml-2 text-xs text-muted-foreground">
						Finding images...
					</span>
				</div>
			) : isQueryError ? (
				<>
					<div className="border-t border-border my-2" />
					<div className="flex items-center justify-center gap-2 py-4 text-destructive">
						<LuAlertCircle className="size-4" />
						<span className="text-xs">Failed to load images</span>
					</div>
				</>
			) : images && images.length > 0 ? (
				<>
					<div className="border-t border-border my-2" />
					<p className="text-xs text-muted-foreground mb-2">
						Images in repository
					</p>
					<div className="grid grid-cols-6 gap-1.5 max-h-[120px] overflow-y-auto">
						{images.slice(0, 24).map((image) => (
							<ImageThumbnail
								key={image.path}
								workspaceId={workspaceId}
								imagePath={image.path}
								isSelected={currentImagePath === image.path}
								onSelect={() => handleSelect(image.path)}
								disabled={isMutating}
							/>
						))}
					</div>
					{images.length > 24 && (
						<p className="text-xs text-muted-foreground mt-2">
							+{images.length - 24} more images
						</p>
					)}
				</>
			) : (
				<>
					<div className="border-t border-border my-2" />
					<p className="text-xs text-muted-foreground text-center py-2">
						No images found in repository
					</p>
				</>
			)}
		</div>
	);
}

import { ContextMenuItem } from "@superset/ui/context-menu";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuCheck, LuFolder, LuLoader, LuWand } from "react-icons/lu";
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
}: {
	workspaceId: string;
	imagePath: string;
	isSelected: boolean;
	onSelect: () => void;
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
			className={cn(
				"relative size-6 rounded overflow-hidden border transition-colors",
				isSelected
					? "border-primary ring-1 ring-primary"
					: "border-border hover:border-primary/50",
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

	const { data: images, isLoading } =
		electronTrpc.workspaces.discoverImages.useQuery(
			{ workspaceId },
			{
				staleTime: 30 * 1000, // 30 seconds
				refetchOnWindowFocus: false,
			},
		);

	const setWorkspaceImage =
		electronTrpc.workspaces.setWorkspaceImage.useMutation({
			onSuccess: () => {
				utils.workspaces.getWorkspaceImage.invalidate({ workspaceId });
			},
		});

	const handleSelect = (imagePath: string | null) => {
		setWorkspaceImage.mutate({ workspaceId, imagePath });
		onSelect(imagePath);
	};

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
					className="flex items-center gap-2"
				>
					<LuWand className="size-4" />
					<span className="flex-1">Auto-detect</span>
					{isAutoSelected && <LuCheck className="size-4 text-primary" />}
				</ContextMenuItem>
				<ContextMenuItem
					onSelect={() => handleSelect("")}
					className="flex items-center gap-2"
				>
					<LuFolder className="size-4" />
					<span className="flex-1">Default icon</span>
					{isNoneSelected && <LuCheck className="size-4 text-primary" />}
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

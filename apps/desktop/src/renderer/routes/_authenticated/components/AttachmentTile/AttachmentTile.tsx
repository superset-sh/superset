import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { getFileIcon } from "renderer/lib/fileIcons/getFileIcon";

interface AttachmentTileProps {
	filename: string;
	imageUrl: string | null;
	overlay?: ReactNode;
	onOpen: (() => void) | null;
	onRemove?: () => void;
}

export function AttachmentTile({
	filename,
	imageUrl,
	overlay,
	onOpen,
	onRemove,
}: AttachmentTileProps) {
	const { t } = useLingui();
	const dotIndex = filename.lastIndexOf(".");
	const extension =
		dotIndex > 0 ? filename.slice(dotIndex + 1).toUpperCase() : "";
	const removeButton = onRemove && (
		<button
			type="button"
			aria-label={t({
				message: "Remove attachment",
			})}
			className="absolute top-1 right-1 z-10 flex size-5 cursor-pointer items-center justify-center rounded-full bg-background/80 text-muted-foreground shadow-sm transition-colors hover:text-foreground"
			onClick={onRemove}
		>
			<XIcon className="size-3" />
		</button>
	);

	if (imageUrl) {
		return (
			<div className="group relative shrink-0">
				<button
					type="button"
					aria-label={t({
						message: `Preview ${filename}`,
					})}
					className="relative block size-16 cursor-pointer overflow-hidden rounded-xl border-[0.5px] border-border bg-foreground/[0.04]"
					onClick={() => onOpen?.()}
				>
					<img
						src={imageUrl}
						alt={filename}
						className="size-full object-cover"
					/>
					{overlay}
				</button>
				{removeButton}
			</div>
		);
	}

	return (
		<div className="group relative shrink-0">
			<button
				type="button"
				disabled={!onOpen}
				onClick={() => onOpen?.()}
				className={cn(
					"relative flex h-16 w-[200px] items-center gap-2.5 rounded-xl border-[0.5px] border-border bg-foreground/[0.03] px-2.5 text-left",
					onOpen &&
						"cursor-pointer transition-colors hover:bg-foreground/[0.06]",
				)}
			>
				<div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06]">
					<img
						src={getFileIcon(filename, false).src}
						alt=""
						className="size-5"
					/>
				</div>
				<div className="min-w-0 flex-1 pr-3">
					<div className="truncate text-xs text-foreground">{filename}</div>
					{extension && (
						<div className="text-[10px] text-muted-foreground">{extension}</div>
					)}
				</div>
				{overlay}
			</button>
			{removeButton}
		</div>
	);
}

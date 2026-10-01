"use client";

import { useLingui } from "@lingui/react/macro";
import type { CommentImage } from "@superset/shared/page-comments";
import { useState } from "react";
import { cn } from "../../../../../../lib/utils";
import { Dialog, DialogContent, DialogTitle } from "../../../../../ui/dialog";

interface CommentImagesProps {
	attachments: CommentImage[];
	className?: string;
}

export function CommentImages({ attachments, className }: CommentImagesProps) {
	const { t } = useLingui();
	const [openImage, setOpenImage] = useState<CommentImage | null>(null);

	if (attachments.length === 0) return null;

	return (
		<div className={cn("flex flex-wrap gap-1.5", className)}>
			{attachments.map((attachment) => (
				<button
					key={attachment.fileId}
					type="button"
					onClick={() => setOpenImage(attachment)}
					aria-label={t({ message: `View ${attachment.name}` })}
					className="overflow-hidden rounded-md border transition-opacity hover:opacity-90 focus-visible:ring-1 focus-visible:ring-ring"
				>
					<img
						src={attachment.url}
						alt={attachment.name}
						loading="lazy"
						className={cn(
							"max-h-40 object-cover",
							attachments.length === 1 ? "max-w-full" : "size-24",
						)}
					/>
				</button>
			))}
			<Dialog
				open={openImage !== null}
				onOpenChange={(open) => {
					if (!open) setOpenImage(null);
				}}
			>
				<DialogContent className="w-fit max-w-[90vw] p-2 sm:max-w-[90vw]">
					{openImage ? (
						<>
							<DialogTitle className="sr-only">{openImage.name}</DialogTitle>
							<img
								src={openImage.url}
								alt={openImage.name}
								className="max-h-[85vh] max-w-full rounded-sm object-contain"
							/>
						</>
					) : null}
				</DialogContent>
			</Dialog>
		</div>
	);
}

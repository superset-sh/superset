"use client";

import { XIcon } from "lucide-react";
import type { ReactNode } from "react";

export type ComposerPanelProps = {
	title: string;
	placement?: "top" | "bottom";
	onClose: () => void;
	children: ReactNode;
};

export function ComposerPanel({
	title,
	placement = "top",
	onClose,
	children,
}: ComposerPanelProps) {
	return (
		<div
			className={`absolute left-0 z-30 w-full rounded-xl bg-popover/95 p-4 text-popover-foreground shadow-xl ring-1 ring-border backdrop-blur-sm ${placement === "bottom" ? "top-full mt-2" : "bottom-full mb-2"}`}
		>
			<div className="mb-3 flex items-center justify-between">
				<p className="text-sm text-muted-foreground">{title}</p>
				<button
					type="button"
					aria-label={`Close ${title}`}
					onClick={onClose}
					className="flex h-[var(--btn-h-sm)] w-[var(--btn-h-sm)] cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-grayAlpha-100 hover:text-foreground"
				>
					<XIcon className="size-4" />
				</button>
			</div>
			<div className="overflow-x-auto">{children}</div>
		</div>
	);
}

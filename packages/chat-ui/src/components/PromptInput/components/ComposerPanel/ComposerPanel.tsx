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
			className={`absolute left-0 z-30 w-full rounded-2xl bg-popover/95 p-4 shadow-xl ring-1 ring-border backdrop-blur-sm ${placement === "bottom" ? "top-full mt-2" : "bottom-full mb-2"}`}
		>
			<div className="mb-3 flex items-center justify-between">
				<p className="text-sm text-muted-foreground">{title}</p>
				<button
					type="button"
					aria-label={`Close ${title}`}
					onClick={onClose}
					className="flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					<XIcon className="size-4" />
				</button>
			</div>
			<div className="overflow-x-auto">{children}</div>
		</div>
	);
}

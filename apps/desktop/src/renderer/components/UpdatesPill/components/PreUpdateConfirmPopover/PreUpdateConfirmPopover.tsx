import type { DesktopNotice } from "@superset/shared/desktop-notices";
import { Button } from "@superset/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@superset/ui/popover";
import type { ReactNode } from "react";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";

interface PreUpdateConfirmPopoverProps {
	open: boolean;
	notice: DesktopNotice | null;
	onConfirm: () => void;
	onCancel: () => void;
	children: ReactNode;
}

/**
 * Confirmation for `trigger: "pre-update"` notices — anchored to the update
 * pill, shown only at the moment of update intent. Backing out is
 * session-only: the next update click asks again.
 */
export function PreUpdateConfirmPopover({
	open,
	notice,
	onConfirm,
	onCancel,
	children,
}: PreUpdateConfirmPopoverProps) {
	if (!notice) return <>{children}</>;

	return (
		<Popover open={open} onOpenChange={(o) => !o && onCancel()}>
			<PopoverAnchor className="inline-flex shrink-0">{children}</PopoverAnchor>
			<PopoverContent
				side="top"
				align="start"
				className="relative w-72 overflow-hidden rounded-none p-0"
			>
				<div className="p-3.5">
					<MarkdownRenderer
						content={notice.body}
						allowHtml={false}
						className="h-auto overflow-visible text-xs [&_article]:max-w-none [&_article]:p-0 [&_img]:mx-auto [&_img]:max-h-32 [&_img]:rounded-none"
					/>
					<div className="mt-3 flex justify-end gap-1.5">
						<Button variant="ghost" size="sm" onClick={onCancel}>
							Not now
						</Button>
						<Button size="sm" onClick={onConfirm}>
							Continue update
						</Button>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}

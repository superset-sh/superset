import type { DesktopNotice } from "@superset/shared/desktop-notices";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogTitle,
} from "@superset/ui/dialog";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import { useAutoUpdateStatus } from "renderer/components/UpdatesPill/useAutoUpdateStatus";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { AUTO_UPDATE_STATUS } from "shared/auto-update";

interface NoticeDialogProps {
	notice: DesktopNotice;
	onDismiss: (noticeId: string) => void;
}

/** Soft (warning/info) server-driven notice: a markdown body plus optional CTA. */
export function NoticeDialog({ notice, onDismiss }: NoticeDialogProps) {
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const install = electronTrpc.autoUpdate.install.useMutation();
	const check = electronTrpc.autoUpdate.check.useMutation();
	const updateEvent = useAutoUpdateStatus();

	const handleOpenChange = (open: boolean) => {
		if (!open && notice.dismissible) onDismiss(notice.id);
	};

	const runCta = () => {
		const cta = notice.cta;
		if (!cta) return;
		if (cta.action === "open-url") {
			if (cta.url) openUrl.mutate(cta.url);
		} else if (updateEvent?.status === AUTO_UPDATE_STATUS.READY) {
			install.mutate();
		} else {
			check.mutate();
		}
		if (notice.dismissible) onDismiss(notice.id);
	};

	return (
		<Dialog open modal onOpenChange={handleOpenChange}>
			<DialogContent
				className="max-w-md gap-0 overflow-hidden rounded-none p-0"
				showCloseButton={false}
				onEscapeKeyDown={(e) => !notice.dismissible && e.preventDefault()}
				onInteractOutside={(e) => !notice.dismissible && e.preventDefault()}
			>
				<DialogTitle className="sr-only">Notice</DialogTitle>
				<div className="p-5">
					<MarkdownRenderer
						content={notice.body}
						allowHtml={false}
						// images bleed edge-to-edge (cover-style); a leading image also bleeds to the top
						className="h-auto overflow-visible text-[13px] [&_article]:max-w-none [&_article]:p-0 [&_article>*:first-child]:mt-0 [&_article>*:first-child_img]:-mt-5 [&_img]:-mx-5 [&_img]:w-[calc(100%+2.5rem)] [&_img]:max-w-none [&_img]:max-h-52 [&_img]:object-cover"
					/>
					{(notice.dismissible || notice.cta) && (
						<DialogFooter className="mt-4 flex-row justify-end gap-2">
							{notice.dismissible && (
								<Button
									variant="ghost"
									size="sm"
									onClick={() => onDismiss(notice.id)}
								>
									Dismiss
								</Button>
							)}
							{notice.cta && (
								<Button size="sm" onClick={runCta}>
									{notice.cta.label}
								</Button>
							)}
						</DialogFooter>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

import type { DesktopNotice } from "@superset/shared/desktop-notices";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { cn } from "@superset/ui/utils";
import { HiExclamationTriangle, HiInformationCircle } from "react-icons/hi2";
import { useNoticeCta } from "renderer/components/DesktopNotices/hooks/useNoticeCta";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";

interface NoticeDialogProps {
	notice: DesktopNotice;
	onDismiss: (noticeId: string) => void;
}

/** Soft (warning/info) server-driven notice, per the version-notices design. */
export function NoticeDialog({ notice, onDismiss }: NoticeDialogProps) {
	const runCta = useNoticeCta();
	const isWarning = notice.severity === "warning";

	const handleOpenChange = (open: boolean) => {
		if (!open && notice.dismissible) onDismiss(notice.id);
	};

	return (
		<Dialog open modal onOpenChange={handleOpenChange}>
			<DialogContent
				className="max-w-md gap-0 overflow-hidden p-0"
				showCloseButton={notice.dismissible}
				onEscapeKeyDown={(e) => !notice.dismissible && e.preventDefault()}
				onInteractOutside={(e) => !notice.dismissible && e.preventDefault()}
			>
				<div
					className={cn(
						"absolute inset-y-0 left-0 w-[3px]",
						isWarning ? "bg-amber-500" : "bg-blue-500",
					)}
				/>
				<div className="p-5 pl-6">
					<DialogHeader className="mb-2.5">
						<div className="flex items-center gap-2.5">
							<div
								className={cn(
									"flex size-7 shrink-0 items-center justify-center rounded-lg",
									isWarning
										? "bg-amber-500/15 text-amber-500"
										: "bg-blue-500/15 text-blue-400",
								)}
							>
								{isWarning ? (
									<HiExclamationTriangle className="size-4" />
								) : (
									<HiInformationCircle className="size-4" />
								)}
							</div>
							<DialogTitle className="text-sm font-semibold">
								{notice.title}
							</DialogTitle>
						</div>
					</DialogHeader>
					<MarkdownRenderer
						content={notice.body}
						className="h-auto overflow-visible text-[13px] text-muted-foreground [&_article]:max-w-none [&_article]:p-0 [&_img]:mx-auto [&_img]:max-h-56 [&_img]:rounded-md"
					/>
					<DialogFooter className="mt-4 flex-row items-center justify-end gap-2">
						<span className="mr-auto font-mono text-[11px] text-muted-foreground">
							you're on v{window.App.appVersion}
						</span>
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
							<Button
								size="sm"
								onClick={() => {
									runCta(notice.cta);
									if (notice.dismissible) onDismiss(notice.id);
								}}
							>
								{notice.cta.label}
							</Button>
						)}
					</DialogFooter>
				</div>
			</DialogContent>
		</Dialog>
	);
}

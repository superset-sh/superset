import { Trans, useLingui } from "@lingui/react/macro";
import type { SelectScreenshot } from "@superset/local-db";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { ScrollArea } from "@superset/ui/scroll-area";
import { toast } from "@superset/ui/sonner";
import { useEffect, useState } from "react";
import { LuCheck } from "react-icons/lu";
import { TbCopy, TbFolderOpen } from "react-icons/tb";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { electronTrpcClient } from "renderer/lib/trpc-client";

interface ScreenshotsDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function ScreenshotsDialog({
	open,
	onOpenChange,
}: ScreenshotsDialogProps) {
	const { t } = useLingui();
	const [rows, setRows] = useState<SelectScreenshot[]>([]);
	const { copyToClipboard } = useCopyToClipboard();

	useEffect(() => {
		if (!open) return;
		const sub = electronTrpcClient.screenshots.onChanged.subscribe(undefined, {
			onData: setRows,
		});
		return () => sub.unsubscribe();
	}, [open]);

	const handleOpen = (id: string) => {
		electronTrpcClient.screenshots.openFile.mutate({ id }).catch(() => {});
	};

	const handleShowInFolder = (id: string) => {
		electronTrpcClient.screenshots.showInFolder.mutate({ id }).catch(() => {});
	};

	const handleCopyPath = (savePath: string) => {
		copyToClipboard(savePath)
			.then(() => {
				toast.success(
					t({
						message: "Path copied",
					}),
					{
						description: savePath,
						icon: (
							<span className="flex size-4 items-center justify-center rounded-full bg-emerald-500">
								<LuCheck className="size-2.5 text-white" strokeWidth={3} />
							</span>
						),
					},
				);
			})
			.catch(() => {
				toast.error(
					t({
						message: "Couldn't copy path",
					}),
				);
			});
	};

	const handleClear = () => {
		electronTrpcClient.screenshots.clear.mutate().catch(() => {});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>
						<Trans>Screenshots</Trans>
					</DialogTitle>
				</DialogHeader>
				<ScrollArea className="h-80 min-w-0 -mx-1 px-1">
					{rows.length === 0 ? (
						<p className="py-8 text-center text-sm text-muted-foreground">
							<Trans>No screenshots yet</Trans>
						</p>
					) : (
						<div className="flex min-w-0 flex-col">
							{rows.map((row) => (
								<div
									key={row.id}
									className="flex w-full min-w-0 items-center gap-2.5 rounded-md px-2 py-2 text-sm"
								>
									<button
										type="button"
										onClick={() => handleOpen(row.id)}
										className="min-w-0 flex-1 text-left"
									>
										<div className="flex items-center gap-2.5">
											<img
												src={row.thumbnail}
												alt=""
												className="h-10 w-14 shrink-0 rounded border border-border object-cover"
											/>
											<div className="min-w-0">
												<div className="truncate text-foreground">
													{row.filename}
												</div>
												<div className="truncate text-xs text-muted-foreground">
													{new Date(row.capturedAt).toLocaleString()} ·{" "}
													{row.width}×{row.height}
												</div>
											</div>
										</div>
									</button>
									<button
										type="button"
										onClick={() => handleCopyPath(row.savePath)}
										aria-label={t({
											message: "Copy path",
										})}
										title={t({
											message: "Copy path",
										})}
										className="shrink-0 rounded p-1 text-muted-foreground/60 transition-colors hover:text-foreground"
									>
										<TbCopy className="size-4" />
									</button>
									<button
										type="button"
										onClick={() => handleShowInFolder(row.id)}
										aria-label={t({
											message: "Show in folder",
										})}
										title={t({
											message: "Show in folder",
										})}
										className="shrink-0 rounded p-1 text-muted-foreground/60 transition-colors hover:text-foreground"
									>
										<TbFolderOpen className="size-4" />
									</button>
								</div>
							))}
						</div>
					)}
				</ScrollArea>
				<div className="flex justify-end border-t pt-3">
					<Button
						variant="ghost"
						size="sm"
						onClick={handleClear}
						disabled={rows.length === 0}
					>
						<Trans>Clear list</Trans>
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

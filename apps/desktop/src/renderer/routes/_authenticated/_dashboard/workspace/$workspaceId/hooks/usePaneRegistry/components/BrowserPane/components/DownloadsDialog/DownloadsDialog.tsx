import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import type { SelectDownload } from "@superset/local-db";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { ScrollArea } from "@superset/ui/scroll-area";
import { useEffect, useState } from "react";
import { TbFolderOpen, TbX } from "react-icons/tb";
import { electronTrpcClient } from "renderer/lib/trpc-client";

type DownloadRow = SelectDownload;

interface DownloadsDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024)
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function stateLabel(row: DownloadRow): string {
	switch (row.state) {
		case "progressing": {
			const total = row.totalBytes;
			return total
				? i18n._({
						...msg({
							message: "{received} of {total}",
						}),
						values: {
							received: formatBytes(row.receivedBytes),
							total: formatBytes(total),
						},
					})
				: formatBytes(row.receivedBytes);
		}
		case "completed":
			return formatBytes(row.receivedBytes);
		case "cancelled":
			return i18n._(
				msg({
					message: "Cancelled",
				}),
			);
		case "interrupted":
			return i18n._(
				msg({
					message: "Failed",
				}),
			);
	}
}

export function DownloadsDialog({ open, onOpenChange }: DownloadsDialogProps) {
	const { t } = useLingui();
	const [rows, setRows] = useState<DownloadRow[]>([]);

	useEffect(() => {
		if (!open) return;
		const sub = electronTrpcClient.downloads.onChanged.subscribe(undefined, {
			onData: setRows,
		});
		return () => sub.unsubscribe();
	}, [open]);

	const handleCancel = (id: string) => {
		electronTrpcClient.downloads.cancel.mutate({ id }).catch(() => {});
	};

	const handleOpen = (id: string) => {
		electronTrpcClient.downloads.openFile.mutate({ id }).catch(() => {});
	};

	const handleShowInFolder = (id: string) => {
		electronTrpcClient.downloads.showInFolder.mutate({ id }).catch(() => {});
	};

	const handleClear = () => {
		electronTrpcClient.downloads.clear.mutate().catch(() => {});
	};

	const hasFinished = rows.some((r) => r.state !== "progressing");

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>
						<Trans>Downloads</Trans>
					</DialogTitle>
				</DialogHeader>
				<ScrollArea className="h-80 min-w-0 -mx-1 px-1">
					{rows.length === 0 ? (
						<p className="py-8 text-center text-sm text-muted-foreground">
							<Trans>No downloads yet</Trans>
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
										onClick={() =>
											row.state === "completed" && handleOpen(row.id)
										}
										disabled={row.state !== "completed"}
										className="min-w-0 flex-1 text-left disabled:cursor-default"
									>
										<div className="truncate text-foreground">
											{row.filename}
										</div>
										<div className="truncate text-xs text-muted-foreground">
											{stateLabel(row)}
										</div>
									</button>
									{row.state === "progressing" ? (
										<button
											type="button"
											onClick={() => handleCancel(row.id)}
											aria-label={t({
												message: "Cancel download",
											})}
											className="shrink-0 rounded p-1 text-muted-foreground/60 transition-colors hover:text-foreground"
										>
											<TbX className="size-4" />
										</button>
									) : (
										<button
											type="button"
											onClick={() => handleShowInFolder(row.id)}
											aria-label={t({
												message: "Show in folder",
											})}
											className="shrink-0 rounded p-1 text-muted-foreground/60 transition-colors hover:text-foreground"
										>
											<TbFolderOpen className="size-4" />
										</button>
									)}
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
						disabled={!hasFinished}
					>
						<Trans>Clear list</Trans>
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

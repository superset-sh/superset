import { Trans, useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { CheckIcon, MinusIcon, PlusIcon, RotateCcwIcon } from "lucide-react";
import { useState } from "react";
import { TbDots } from "react-icons/tb";
import { ImportHistoryDialog } from "renderer/components/ImportHistoryDialog";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { browserRuntimeRegistry } from "../../browserRuntimeRegistry";
import { ClearBrowsingDataDialog } from "../ClearBrowsingDataDialog";
import { DownloadsDialog } from "../DownloadsDialog";
import { HistoryDialog } from "../HistoryDialog";
import { ScreenshotsDialog } from "../ScreenshotsDialog";
import { SignedInSitesSubmenu } from "../SignedInSitesSubmenu";

interface BrowserOverflowMenuProps {
	paneId: string;
	currentUrl: string;
	hasPage: boolean;
	zoomFactor: number;
	isDeviceToolbarOpen: boolean;
	onToggleDeviceToolbar: () => void;
	onOpenFindBar: () => void;
	onNavigateToUrl: (url: string) => void;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.1;

/**
 * A Dialog opened synchronously from the same click that's dismissing
 * something else (a DropdownMenuItem select, a toast action) gets caught by
 * that other element's own close cycle and immediately dismisses itself (a
 * well-known Radix issue): the closing element's exit animation (~150ms) is
 * still running, and its eventual focus-restore reads as a focus/pointer-
 * outside on the just-opened dialog. Waiting out the exit animation before
 * opening the dialog avoids the race.
 */
const MENU_CLOSE_ANIMATION_MS = 200;

function openAfterClose(setOpen: (open: boolean) => void) {
	return () => {
		setTimeout(() => setOpen(true), MENU_CLOSE_ANIMATION_MS);
	};
}

export function BrowserOverflowMenu({
	paneId,
	currentUrl,
	hasPage,
	zoomFactor,
	isDeviceToolbarOpen,
	onToggleDeviceToolbar,
	onOpenFindBar,
	onNavigateToUrl,
}: BrowserOverflowMenuProps) {
	const { t } = useLingui();
	const { copyToClipboard } = useCopyToClipboard();
	const navigate = useNavigate();
	const [isImportOpen, setIsImportOpen] = useState(false);
	const [isHistoryOpen, setIsHistoryOpen] = useState(false);
	const [isDownloadsOpen, setIsDownloadsOpen] = useState(false);
	const [isScreenshotsOpen, setIsScreenshotsOpen] = useState(false);
	const [isClearDataOpen, setIsClearDataOpen] = useState(false);

	const handlePrint = () => browserRuntimeRegistry.print(paneId);

	const handleZoomOut = () =>
		browserRuntimeRegistry.setZoomFactor(
			paneId,
			Math.max(MIN_ZOOM, zoomFactor - ZOOM_STEP),
		);

	const handleZoomIn = () =>
		browserRuntimeRegistry.setZoomFactor(
			paneId,
			Math.min(MAX_ZOOM, zoomFactor + ZOOM_STEP),
		);

	const handleZoomReset = () => browserRuntimeRegistry.setZoomFactor(paneId, 1);

	const handleScreenshot = () => {
		electronTrpcClient.browser.screenshot
			.mutate({ paneId })
			.then(({ base64 }) => {
				toast.success(
					t({
						message: "Screenshot copied to clipboard",
					}),
					{
						description: (
							<img
								src={`data:image/png;base64,${base64}`}
								alt={t({
									message: "Screenshot preview",
								})}
								className="mt-1 max-h-32 w-full rounded border border-border object-contain"
							/>
						),
						action: {
							label: t({
								message: "View all",
							}),
							// Same Radix dismissable-layer race as the menu items below:
							// opening the Dialog synchronously from this click lets Radix's
							// newly-mounted outside-click detector see the tail of that same
							// click and immediately close it.
							onClick: openAfterClose(setIsScreenshotsOpen),
						},
					},
				);
			})
			.catch(() => {
				toast.error(
					t({
						message: "Could not take a screenshot",
					}),
				);
			});
	};

	const handleHardReload = () => {
		electronTrpcClient.browser.reload
			.mutate({ paneId, hard: true })
			.catch(() => {});
	};

	const handleCopyUrl = () => {
		if (currentUrl) copyToClipboard(currentUrl);
	};

	const handleOpenExternal = () => {
		if (currentUrl) {
			electronTrpcClient.external.openUrl.mutate(currentUrl).catch(() => {});
		}
	};

	const handleOpenSettings = () => {
		void navigate({ to: "/settings/browser" });
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-muted/50 hover:text-foreground"
					>
						<TbDots className="size-3.5" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-64">
					<DropdownMenuItem onClick={onOpenFindBar} disabled={!hasPage}>
						<Trans>Find in page</Trans>
					</DropdownMenuItem>
					<DropdownMenuItem onClick={handlePrint} disabled={!hasPage}>
						<Trans>Print</Trans>
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					{/* A plain row of buttons here would be unreachable by arrow-key menu
					    navigation (Radix only moves focus between registered items) and
					    Tab closes the menu — so the whole row is one item, with
					    Left/Right/Enter driving zoom while it's focused. */}
					<DropdownMenuItem
						disabled={!hasPage}
						onSelect={(e) => e.preventDefault()}
						onKeyDown={(e) => {
							if (e.key === "ArrowLeft") {
								e.preventDefault();
								handleZoomOut();
							} else if (e.key === "ArrowRight") {
								e.preventDefault();
								handleZoomIn();
							} else if (e.key === "Enter" || e.key === "0") {
								e.preventDefault();
								handleZoomReset();
							}
						}}
						className="justify-between gap-2"
					>
						<span>
							<Trans>Zoom</Trans>
						</span>
						<div className="flex items-center gap-0.5">
							<button
								type="button"
								tabIndex={-1}
								onClick={handleZoomOut}
								disabled={!hasPage || zoomFactor <= MIN_ZOOM}
								aria-label={t({
									message: "Zoom out",
								})}
								className="rounded p-1 text-muted-foreground/70 transition-colors hover:bg-muted/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
							>
								<MinusIcon className="size-3.5" />
							</button>
							<span className="w-10 text-center text-xs tabular-nums text-muted-foreground">
								{Math.round(zoomFactor * 100)}%
							</span>
							<button
								type="button"
								tabIndex={-1}
								onClick={handleZoomIn}
								disabled={!hasPage || zoomFactor >= MAX_ZOOM}
								aria-label={t({
									message: "Zoom in",
								})}
								className="rounded p-1 text-muted-foreground/70 transition-colors hover:bg-muted/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
							>
								<PlusIcon className="size-3.5" />
							</button>
							<button
								type="button"
								tabIndex={-1}
								onClick={handleZoomReset}
								disabled={!hasPage || zoomFactor === 1}
								aria-label={t({
									message: "Reset zoom",
								})}
								className="rounded p-1 text-muted-foreground/70 transition-colors hover:bg-muted/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
							>
								<RotateCcwIcon className="size-3.5" />
							</button>
						</div>
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={onToggleDeviceToolbar}
						disabled={!hasPage}
						className="justify-between"
					>
						<Trans>Show device toolbar</Trans>
						{isDeviceToolbarOpen && <CheckIcon className="size-3.5" />}
					</DropdownMenuItem>
					<DropdownMenuItem onClick={handleScreenshot} disabled={!hasPage}>
						<Trans>Take a screenshot</Trans>
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={handleHardReload} disabled={!hasPage}>
						<Trans>Hard reload</Trans>
					</DropdownMenuItem>
					<DropdownMenuItem onClick={handleCopyUrl} disabled={!hasPage}>
						<Trans>Copy URL</Trans>
					</DropdownMenuItem>
					<DropdownMenuItem onClick={handleOpenExternal} disabled={!hasPage}>
						<Trans>Open in Browser</Trans>
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem onSelect={openAfterClose(setIsImportOpen)}>
						<Trans>Import cookies and passwords…</Trans>
					</DropdownMenuItem>
					<SignedInSitesSubmenu />
					<DropdownMenuItem onSelect={openAfterClose(setIsDownloadsOpen)}>
						<Trans>Downloads</Trans>
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={openAfterClose(setIsScreenshotsOpen)}>
						<Trans>Screenshots</Trans>
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={openAfterClose(setIsHistoryOpen)}>
						<Trans>History</Trans>
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={openAfterClose(setIsClearDataOpen)}>
						<Trans>Clear browsing data</Trans>
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={handleOpenSettings}>
						<Trans>Browser settings</Trans>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<ImportHistoryDialog open={isImportOpen} onOpenChange={setIsImportOpen} />
			<HistoryDialog
				open={isHistoryOpen}
				onOpenChange={setIsHistoryOpen}
				onSelect={onNavigateToUrl}
			/>
			<DownloadsDialog
				open={isDownloadsOpen}
				onOpenChange={setIsDownloadsOpen}
			/>
			<ScreenshotsDialog
				open={isScreenshotsOpen}
				onOpenChange={setIsScreenshotsOpen}
			/>
			<ClearBrowsingDataDialog
				open={isClearDataOpen}
				onOpenChange={setIsClearDataOpen}
			/>
		</>
	);
}

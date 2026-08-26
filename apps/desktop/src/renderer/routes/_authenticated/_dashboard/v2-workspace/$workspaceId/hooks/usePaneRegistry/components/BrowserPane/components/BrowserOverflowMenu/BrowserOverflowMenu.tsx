import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
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
 * A Dialog opened synchronously from a DropdownMenuItem's select gets caught
 * by the menu's own close cycle and immediately dismisses itself (a
 * well-known Radix DropdownMenu + Dialog interaction): the closing menu's
 * exit animation (~150ms) is still running, and its eventual focus-restore
 * to the trigger button reads as a focus-outside on the just-opened dialog.
 * Waiting out the exit animation before opening the dialog avoids the race.
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
	const { copyToClipboard } = useCopyToClipboard();
	const navigate = useNavigate();
	const [isImportOpen, setIsImportOpen] = useState(false);
	const [isHistoryOpen, setIsHistoryOpen] = useState(false);
	const [isDownloadsOpen, setIsDownloadsOpen] = useState(false);
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
		electronTrpcClient.browser.screenshot.mutate({ paneId }).catch(() => {});
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
						Find in page
					</DropdownMenuItem>
					<DropdownMenuItem onClick={handlePrint} disabled={!hasPage}>
						Print
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<div className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm">
						<span>Zoom</span>
						<div className="flex items-center gap-0.5">
							<button
								type="button"
								onClick={handleZoomOut}
								disabled={!hasPage || zoomFactor <= MIN_ZOOM}
								aria-label="Zoom out"
								className="rounded p-1 text-muted-foreground/70 transition-colors hover:bg-muted/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
							>
								<MinusIcon className="size-3.5" />
							</button>
							<span className="w-10 text-center text-xs tabular-nums text-muted-foreground">
								{Math.round(zoomFactor * 100)}%
							</span>
							<button
								type="button"
								onClick={handleZoomIn}
								disabled={!hasPage || zoomFactor >= MAX_ZOOM}
								aria-label="Zoom in"
								className="rounded p-1 text-muted-foreground/70 transition-colors hover:bg-muted/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
							>
								<PlusIcon className="size-3.5" />
							</button>
							<button
								type="button"
								onClick={handleZoomReset}
								disabled={!hasPage || zoomFactor === 1}
								aria-label="Reset zoom"
								className="rounded p-1 text-muted-foreground/70 transition-colors hover:bg-muted/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
							>
								<RotateCcwIcon className="size-3.5" />
							</button>
						</div>
					</div>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={onToggleDeviceToolbar}
						disabled={!hasPage}
						className="justify-between"
					>
						Show device toolbar
						{isDeviceToolbarOpen && <CheckIcon className="size-3.5" />}
					</DropdownMenuItem>
					<DropdownMenuItem onClick={handleScreenshot} disabled={!hasPage}>
						Take a screenshot
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={handleHardReload} disabled={!hasPage}>
						Hard reload
					</DropdownMenuItem>
					<DropdownMenuItem onClick={handleCopyUrl} disabled={!hasPage}>
						Copy URL
					</DropdownMenuItem>
					<DropdownMenuItem onClick={handleOpenExternal} disabled={!hasPage}>
						Open in Browser
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem onSelect={openAfterClose(setIsImportOpen)}>
						Import cookies and passwords…
					</DropdownMenuItem>
					<SignedInSitesSubmenu />
					<DropdownMenuItem onSelect={openAfterClose(setIsDownloadsOpen)}>
						Downloads
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={openAfterClose(setIsHistoryOpen)}>
						History
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={openAfterClose(setIsClearDataOpen)}>
						Clear browsing data
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={handleOpenSettings}>
						Browser settings
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
			<ClearBrowsingDataDialog
				open={isClearDataOpen}
				onOpenChange={setIsClearDataOpen}
			/>
		</>
	);
}

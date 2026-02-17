import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import {
	TbCamera,
	TbClock,
	TbCopy,
	TbDots,
	TbReload,
	TbTrash,
} from "react-icons/tb";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface BrowserOverflowMenuProps {
	paneId: string;
	/** Whether a real page is loaded (not about:blank) */
	hasPage: boolean;
}

export function BrowserOverflowMenu({
	paneId,
	hasPage,
}: BrowserOverflowMenuProps) {
	const screenshotMutation = electronTrpc.browser.screenshot.useMutation();
	const reloadMutation = electronTrpc.browser.reload.useMutation();
	const clearBrowsingDataMutation =
		electronTrpc.browser.clearBrowsingData.useMutation();
	const clearHistoryMutation = electronTrpc.browserHistory.clear.useMutation();

	const handleScreenshot = () => {
		screenshotMutation.mutate({ paneId });
	};

	const handleHardReload = () => {
		reloadMutation.mutate({ paneId, hard: true });
	};

	const handleCopyUrl = () => {
		const webview = document.querySelector(
			`webview[data-pane-id="${paneId}"]`,
		) as Electron.WebviewTag | null;
		if (webview) {
			navigator.clipboard.writeText(webview.getURL());
		}
	};

	const handleClearCookies = () => {
		clearBrowsingDataMutation.mutate({ type: "cookies" });
	};

	const handleClearHistory = () => {
		clearHistoryMutation.mutate();
	};

	const handleClearAllData = () => {
		clearBrowsingDataMutation.mutate({ type: "all" });
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
				>
					<TbDots className="size-3.5" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				<DropdownMenuItem
					onClick={handleScreenshot}
					disabled={!hasPage}
					className="gap-2"
				>
					<TbCamera className="size-4" />
					Take Screenshot
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={handleHardReload}
					disabled={!hasPage}
					className="gap-2"
				>
					<TbReload className="size-4" />
					Hard Reload
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={handleCopyUrl}
					disabled={!hasPage}
					className="gap-2"
				>
					<TbCopy className="size-4" />
					Copy URL
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={handleClearHistory} className="gap-2">
					<TbClock className="size-4" />
					Clear Browsing History
				</DropdownMenuItem>
				<DropdownMenuItem onClick={handleClearCookies} className="gap-2">
					<TbTrash className="size-4" />
					Clear Cookies
				</DropdownMenuItem>
				<DropdownMenuItem onClick={handleClearAllData} className="gap-2">
					<TbTrash className="size-4" />
					Clear All Data
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

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
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { electronTrpcClient } from "renderer/lib/trpc-client";

interface BrowserOverflowMenuProps {
	paneId: string;
	currentUrl: string;
	hasPage: boolean;
}

export function BrowserOverflowMenu({
	paneId,
	currentUrl,
	hasPage,
}: BrowserOverflowMenuProps) {
	const { copyToClipboard } = useCopyToClipboard();

	const handleScreenshot = () => {
		electronTrpcClient.browser.screenshot.mutate({ paneId }).catch(() => {});
	};

	const handleHardReload = () => {
		electronTrpcClient.browser.reload
			.mutate({ paneId, hard: true })
			.catch(() => {});
	};

	const handleCopyUrl = () => {
		if (currentUrl) {
			copyToClipboard(currentUrl);
		}
	};

	const handleClearCookies = () => {
		electronTrpcClient.browser.clearBrowsingData
			.mutate({ type: "cookies" })
			.catch(() => {});
	};

	const handleClearHistory = () => {
		electronTrpcClient.browserHistory.clear.mutate().catch(() => {});
	};

	const handleClearAllData = () => {
		electronTrpcClient.browser.clearBrowsingData
			.mutate({ type: "all" })
			.catch(() => {});
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

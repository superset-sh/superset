import { Button } from "@superset/ui/button";
import { Checkbox } from "@superset/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";

interface ClearBrowsingDataDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function ClearBrowsingDataDialog({
	open,
	onOpenChange,
}: ClearBrowsingDataDialogProps) {
	const [clearHistory, setClearHistory] = useState(true);
	const [clearCookies, setClearCookies] = useState(true);
	const [clearCache, setClearCache] = useState(true);
	const [isClearing, setIsClearing] = useState(false);

	const canClear = clearHistory || clearCookies || clearCache;

	const handleClear = async () => {
		setIsClearing(true);
		try {
			await Promise.all([
				clearHistory ? electronTrpcClient.browserHistory.clear.mutate() : null,
				clearCookies
					? electronTrpcClient.browser.clearBrowsingData.mutate({
							type: "cookies",
						})
					: null,
				clearCache
					? electronTrpcClient.browser.clearBrowsingData.mutate({
							type: "cache",
						})
					: null,
			]);
			toast.success("Browsing data cleared");
			onOpenChange(false);
		} catch (error) {
			toast.error("Could not clear browsing data", {
				description: error instanceof Error ? error.message : undefined,
			});
		} finally {
			setIsClearing(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Clear browsing data</DialogTitle>
					<DialogDescription>
						Choose what to clear from the in-app browser.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-3 py-1">
					<div className="flex items-center gap-2">
						<Checkbox
							id="clear-history"
							checked={clearHistory}
							onCheckedChange={(v) => setClearHistory(v === true)}
						/>
						<Label htmlFor="clear-history" className="font-normal">
							Browsing history
						</Label>
					</div>
					<div className="flex items-center gap-2">
						<Checkbox
							id="clear-cookies"
							checked={clearCookies}
							onCheckedChange={(v) => setClearCookies(v === true)}
						/>
						<Label htmlFor="clear-cookies" className="font-normal">
							Cookies and site data — signs you out of most sites
						</Label>
					</div>
					<div className="flex items-center gap-2">
						<Checkbox
							id="clear-cache"
							checked={clearCache}
							onCheckedChange={(v) => setClearCache(v === true)}
						/>
						<Label htmlFor="clear-cache" className="font-normal">
							Cached images and files
						</Label>
					</div>
				</div>
				<DialogFooter>
					<Button
						variant="ghost"
						onClick={() => onOpenChange(false)}
						disabled={isClearing}
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={handleClear}
						disabled={isClearing || !canClear}
					>
						{isClearing ? "Clearing…" : "Clear data"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

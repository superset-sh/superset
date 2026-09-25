import { Trans, useLingui } from "@lingui/react/macro";
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
	const { t } = useLingui();
	const [clearHistory, setClearHistory] = useState(true);
	const [clearCookies, setClearCookies] = useState(true);
	const [clearCache, setClearCache] = useState(true);
	const [isClearing, setIsClearing] = useState(false);

	const canClear = clearHistory || clearCookies || clearCache;

	const handleClear = async () => {
		setIsClearing(true);
		// Each task is independent (history vs. cookies vs. cache are separate
		// destructive operations) — settle them individually so one rejecting
		// doesn't misreport the others, which may have already completed, as
		// failed too and invite the user to retry work that's already done.
		const tasks: Array<{ label: string; run: () => Promise<unknown> }> = [];
		if (clearHistory) {
			tasks.push({
				label: t({
					message: "history",
				}),
				run: () => electronTrpcClient.browserHistory.clear.mutate(),
			});
		}
		if (clearCookies) {
			tasks.push({
				label: t({
					message: "cookies and site data",
				}),
				run: () =>
					electronTrpcClient.browser.clearBrowsingData.mutate({
						type: "cookies",
					}),
			});
		}
		if (clearCache) {
			tasks.push({
				label: t({
					message: "cached files",
				}),
				run: () =>
					electronTrpcClient.browser.clearBrowsingData.mutate({
						type: "cache",
					}),
			});
		}

		const results = await Promise.allSettled(tasks.map((task) => task.run()));
		const failed = tasks.filter((_, i) => results[i]?.status === "rejected");
		const succeeded = tasks.filter(
			(_, i) => results[i]?.status === "fulfilled",
		);

		if (failed.length === 0) {
			toast.success(
				t({
					message: "Browsing data cleared",
				}),
			);
			onOpenChange(false);
		} else if (succeeded.length > 0) {
			const succeededLabels = succeeded.map((task) => task.label).join(", ");
			const failedLabels = failed.map((task) => task.label).join(", ");
			toast.error(
				t({
					message: `Cleared ${succeededLabels} — could not clear ${failedLabels}`,
				}),
			);
		} else {
			toast.error(
				t({
					message: "Could not clear browsing data",
				}),
			);
		}
		setIsClearing(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						<Trans>Clear browsing data</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>Choose what to clear from the in-app browser.</Trans>
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
							<Trans>Browsing history</Trans>
						</Label>
					</div>
					<div className="flex items-center gap-2">
						<Checkbox
							id="clear-cookies"
							checked={clearCookies}
							onCheckedChange={(v) => setClearCookies(v === true)}
						/>
						<Label htmlFor="clear-cookies" className="font-normal">
							<Trans>Cookies and site data — signs you out of most sites</Trans>
						</Label>
					</div>
					<div className="flex items-center gap-2">
						<Checkbox
							id="clear-cache"
							checked={clearCache}
							onCheckedChange={(v) => setClearCache(v === true)}
						/>
						<Label htmlFor="clear-cache" className="font-normal">
							<Trans>Cached images and files</Trans>
						</Label>
					</div>
				</div>
				<DialogFooter>
					<Button
						variant="ghost"
						onClick={() => onOpenChange(false)}
						disabled={isClearing}
					>
						<Trans>Cancel</Trans>
					</Button>
					<Button
						variant="destructive"
						onClick={handleClear}
						disabled={isClearing || !canClear}
					>
						{isClearing ? <Trans>Clearing…</Trans> : <Trans>Clear data</Trans>}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

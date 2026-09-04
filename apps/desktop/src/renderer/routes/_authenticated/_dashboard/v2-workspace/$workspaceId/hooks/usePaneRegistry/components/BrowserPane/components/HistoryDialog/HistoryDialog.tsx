import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { ScrollArea } from "@superset/ui/scroll-area";
import { useEffect, useMemo, useState } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";

interface HistoryEntry {
	id: string;
	url: string;
	title: string;
	faviconUrl: string | null;
	lastVisitedAt: number;
}

interface HistoryDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSelect: (url: string) => void;
}

export function HistoryDialog({
	open,
	onOpenChange,
	onSelect,
}: HistoryDialogProps) {
	const { t } = useLingui();
	const [entries, setEntries] = useState<HistoryEntry[]>([]);
	const [query, setQuery] = useState("");
	// Whole-table results for the current query. `getAll` only loads the most
	// recent rows, so a client-side filter alone would silently miss anything
	// older (e.g. most of an imported Chrome history).
	const [searchResults, setSearchResults] = useState<HistoryEntry[] | null>(
		null,
	);

	useEffect(() => {
		if (!open) return;
		electronTrpcClient.browserHistory.getAll
			.query()
			.then(setEntries)
			.catch(() => {});
	}, [open]);

	const trimmedQuery = query.trim();

	useEffect(() => {
		if (!open || !trimmedQuery) {
			setSearchResults(null);
			return;
		}
		let cancelled = false;
		const timer = setTimeout(() => {
			electronTrpcClient.browserHistory.search
				.query({ query: trimmedQuery, limit: 100 })
				.then((rows) => {
					if (!cancelled) setSearchResults(rows);
				})
				.catch(() => {});
		}, 150);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [open, trimmedQuery]);

	// Instant feedback from the already-loaded recents while the debounced
	// whole-table search is in flight; server results replace it once in.
	const localFiltered = useMemo(() => {
		const q = trimmedQuery.toLowerCase();
		if (!q) return entries;
		return entries.filter(
			(e) =>
				e.url.toLowerCase().includes(q) || e.title.toLowerCase().includes(q),
		);
	}, [entries, trimmedQuery]);

	const filtered = trimmedQuery ? (searchResults ?? localFiltered) : entries;

	const handleClearHistory = () => {
		electronTrpcClient.browserHistory.clear
			.mutate()
			.then(() => {
				setEntries([]);
				setSearchResults(null);
				setQuery("");
			})
			.catch(() => {});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>
						<Trans>History</Trans>
					</DialogTitle>
				</DialogHeader>
				<Input
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder={t({
						message: "Search history",
					})}
					autoFocus
				/>
				<ScrollArea className="h-80 min-w-0 -mx-1 px-1">
					{filtered.length === 0 ? (
						<p className="py-8 text-center text-sm text-muted-foreground">
							{entries.length === 0 ? (
								<Trans>No history yet</Trans>
							) : (
								<Trans>No matches</Trans>
							)}
						</p>
					) : (
						<div className="flex min-w-0 flex-col">
							{filtered.map((entry) => (
								<button
									key={entry.id}
									type="button"
									onClick={() => {
										onSelect(entry.url);
										onOpenChange(false);
									}}
									className="flex w-full min-w-0 items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted/60"
								>
									{entry.faviconUrl ? (
										<img
											src={entry.faviconUrl}
											alt=""
											className="size-4 shrink-0 rounded-sm"
										/>
									) : (
										<div className="size-4 shrink-0 rounded-sm bg-muted" />
									)}
									<div className="min-w-0 flex-1">
										<div className="truncate text-foreground">
											{entry.title || entry.url}
										</div>
										<div className="truncate text-xs text-muted-foreground">
											{entry.url}
										</div>
									</div>
									<div className="shrink-0 text-xs text-muted-foreground/70">
										{new Date(entry.lastVisitedAt).toLocaleDateString()}
									</div>
								</button>
							))}
						</div>
					)}
				</ScrollArea>
				<div className="flex justify-end border-t pt-3">
					<Button
						variant="ghost"
						size="sm"
						onClick={handleClearHistory}
						disabled={entries.length === 0}
					>
						<Trans>Clear history</Trans>
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

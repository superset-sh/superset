import type { AppRouter } from "@superset/host-service";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { ScrollArea } from "@superset/ui/scroll-area";
import type { inferRouterOutputs } from "@trpc/server";
import { useEffect, useState } from "react";
import { CommitRow } from "../CommitRow";

type Commit =
	inferRouterOutputs<AppRouter>["git"]["listCommits"]["commits"][number];

interface RangeModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	commits: Commit[];
	onSelect: (fromHash: string, toHash: string) => void;
}

export function RangeModal({
	open,
	onOpenChange,
	commits,
	onSelect,
}: RangeModalProps) {
	const [fromIdx, setFromIdx] = useState<number | null>(null);
	const [toIdx, setToIdx] = useState<number | null>(null);

	// Reset selection when modal opens/closes
	useEffect(() => {
		if (!open) {
			setFromIdx(null);
			setToIdx(null);
		}
	}, [open]);

	const handleClick = (idx: number) => {
		if (fromIdx === null) {
			setFromIdx(idx);
			setToIdx(idx);
		} else if (toIdx === fromIdx) {
			setToIdx(idx);
		} else {
			setFromIdx(idx);
			setToIdx(idx);
		}
	};

	const minIdx =
		fromIdx !== null && toIdx !== null ? Math.min(fromIdx, toIdx) : -1;
	const maxIdx =
		fromIdx !== null && toIdx !== null ? Math.max(fromIdx, toIdx) : -1;
	const hasRange = minIdx !== maxIdx && minIdx >= 0;

	const handleApply = () => {
		if (!hasRange) return;
		const from = commits[maxIdx];
		const to = commits[minIdx];
		if (from && to) {
			onSelect(from.hash, to.hash);
			onOpenChange(false);
			setFromIdx(null);
			setToIdx(null);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange} modal>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Select commit range</DialogTitle>
					<DialogDescription>
						Click two commits to define the range.
					</DialogDescription>
				</DialogHeader>

				<ScrollArea className="max-h-[300px]">
					<div className="space-y-0.5">
						{commits.map((commit, idx) => {
							const inRange = idx >= minIdx && idx <= maxIdx;
							return (
								<button
									key={commit.hash}
									type="button"
									onClick={() => handleClick(idx)}
									className={`flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-sm ${
										inRange
											? "bg-accent text-accent-foreground"
											: "hover:bg-accent/50"
									}`}
								>
									<CommitRow commit={commit} />
								</button>
							);
						})}
					</div>
				</ScrollArea>

				<DialogFooter>
					<Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button size="sm" disabled={!hasRange} onClick={handleApply}>
						Apply
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

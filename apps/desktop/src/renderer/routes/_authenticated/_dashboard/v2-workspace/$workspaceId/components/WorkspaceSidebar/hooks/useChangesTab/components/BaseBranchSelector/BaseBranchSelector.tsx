import { Trans, useLingui } from "@lingui/react/macro";
import type { AppRouter } from "@superset/host-service";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { ScrollArea } from "@superset/ui/scroll-area";
import type { inferRouterOutputs } from "@trpc/server";
import { Check, ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";

type Branch =
	inferRouterOutputs<AppRouter>["git"]["listBranches"]["branches"][number];

interface BaseBranchSelectorProps {
	branches: Branch[];
	currentValue: string;
	onChange: (branchName: string) => void;
}

export function BaseBranchSelector({
	branches,
	currentValue,
	onChange,
}: BaseBranchSelectorProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");

	const filtered = useMemo(() => {
		if (!search) return branches;
		const lower = search.toLowerCase();
		return branches.filter((b) => b.name.toLowerCase().includes(lower));
	}, [branches, search]);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				{/* Same chip as the commit-filter trigger beside it, so "vs" sits
				    between two equal paddings instead of hugging the branch. */}
				<button
					type="button"
					className="flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 font-medium text-foreground text-xs hover:bg-accent"
				>
					<span className="min-w-0 truncate" title={currentValue}>
						{currentValue}
					</span>
					<ChevronDown className="size-3 shrink-0 text-muted-foreground" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				className="flex w-64 max-h-96 flex-col p-0 overflow-hidden"
				align="start"
			>
				<div className="border-b px-3 py-2">
					<input
						placeholder={t({
							message: "Search branches...",
						})}
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
					/>
				</div>
				<ScrollArea className="flex-1 overflow-y-auto">
					<div className="p-1">
						{filtered.map((branch) => (
							<button
								key={branch.name}
								type="button"
								className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
								onClick={() => {
									onChange(branch.name);
									setOpen(false);
									setSearch("");
								}}
							>
								<span className="truncate">{branch.name}</span>
								{branch.name === currentValue && (
									<Check className="size-3.5 shrink-0" />
								)}
							</button>
						))}
						{filtered.length === 0 && (
							<div className="px-2 py-3 text-center text-sm text-muted-foreground">
								<Trans>No branches found</Trans>
							</div>
						)}
					</div>
				</ScrollArea>
			</PopoverContent>
		</Popover>
	);
}

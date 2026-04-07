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
				<button
					type="button"
					className="inline-flex items-center gap-0.5 font-medium text-foreground hover:underline"
				>
					{currentValue}
					<ChevronDown className="size-3" />
				</button>
			</PopoverTrigger>
			<PopoverContent className="w-64 p-0" align="start">
				<div className="border-b px-3 py-2">
					<input
						placeholder="Search branches..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
					/>
				</div>
				<ScrollArea className="max-h-[200px]">
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
								No branches found
							</div>
						)}
					</div>
				</ScrollArea>
			</PopoverContent>
		</Popover>
	);
}

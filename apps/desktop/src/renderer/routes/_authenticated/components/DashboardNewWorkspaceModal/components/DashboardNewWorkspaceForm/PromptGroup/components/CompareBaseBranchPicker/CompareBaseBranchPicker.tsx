import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useMemo, useState } from "react";
import { GoGitBranch } from "react-icons/go";
import { HiCheck, HiChevronUpDown } from "react-icons/hi2";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";

interface CompareBaseBranchPickerProps {
	effectiveCompareBaseBranch: string | null;
	defaultBranch: string | null | undefined;
	isBranchesLoading: boolean;
	isBranchesError: boolean;
	branches: Array<{
		name: string;
		lastCommitDate: number;
		isLocal: boolean;
		hasWorkspace: boolean;
	}>;
	onSelectCompareBaseBranch: (branchName: string) => void;
}

export function CompareBaseBranchPicker({
	effectiveCompareBaseBranch,
	defaultBranch,
	isBranchesLoading,
	isBranchesError,
	branches,
	onSelectCompareBaseBranch,
}: CompareBaseBranchPickerProps) {
	const [open, setOpen] = useState(false);
	const [branchSearch, setBranchSearch] = useState("");

	const filteredBranches = useMemo(() => {
		if (!branchSearch) return branches;
		const searchLower = branchSearch.toLowerCase();
		return branches.filter((b) => b.name.toLowerCase().includes(searchLower));
	}, [branches, branchSearch]);

	if (isBranchesError) {
		return (
			<span className="text-xs text-destructive">Failed to load branches</span>
		);
	}

	return (
		<Popover
			open={open}
			onOpenChange={(v) => {
				setOpen(v);
				if (!v) setBranchSearch("");
			}}
		>
			<PopoverTrigger asChild>
				<button
					type="button"
					disabled={isBranchesLoading}
					className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 min-w-0 max-w-full"
				>
					<GoGitBranch className="size-3 shrink-0" />
					{isBranchesLoading ? (
						<span className="h-2.5 w-14 rounded-sm bg-muted-foreground/15 animate-pulse" />
					) : (
						<span className="font-mono truncate">
							{effectiveCompareBaseBranch || "..."}
						</span>
					)}
					<HiChevronUpDown className="size-3 shrink-0" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				className="w-96 p-0"
				align="start"
				onWheel={(event) => event.stopPropagation()}
			>
				<Command shouldFilter={false}>
					<CommandInput
						placeholder="Search branches..."
						value={branchSearch}
						onValueChange={setBranchSearch}
					/>
					<CommandList className="max-h-[400px]">
						<CommandEmpty>No branches found</CommandEmpty>
						{filteredBranches.map((branch) => (
							<CommandItem
								key={branch.name}
								value={branch.name}
								onSelect={() => {
									onSelectCompareBaseBranch(branch.name);
									setOpen(false);
								}}
								className="group h-11 flex items-center justify-between gap-3 px-3"
							>
								<span className="flex items-center gap-2.5 truncate flex-1 min-w-0">
									<GoGitBranch className="size-3.5 shrink-0 text-muted-foreground" />
									<span className="truncate font-mono text-xs">
										{branch.name}
									</span>
									<span className="flex items-center gap-1.5 shrink-0">
										{branch.name === defaultBranch && (
											<span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
												default
											</span>
										)}
										{branch.hasWorkspace && (
											<span className="text-[10px] text-muted-foreground/60 bg-muted/60 px-1.5 py-0.5 rounded">
												workspace
											</span>
										)}
									</span>
								</span>
								<span className="flex items-center gap-2 shrink-0">
									{branch.lastCommitDate > 0 && (
										<span className="text-[11px] text-muted-foreground/70">
											{formatRelativeTime(branch.lastCommitDate * 1000)}
										</span>
									)}
									{effectiveCompareBaseBranch === branch.name && (
										<HiCheck className="size-4 text-primary" />
									)}
								</span>
							</CommandItem>
						))}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

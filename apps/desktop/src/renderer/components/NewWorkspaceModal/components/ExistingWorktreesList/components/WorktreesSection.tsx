import { Button } from "@superset/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { formatDistanceToNow } from "date-fns";
import { HiChevronUpDown } from "react-icons/hi2";
import { LuGitBranch } from "react-icons/lu";

interface Worktree {
	id: string;
	branch: string;
	path: string;
	createdAt: number;
	hasActiveWorkspace: boolean;
}

interface WorktreesSectionProps {
	closedWorktrees: Worktree[];
	openWorktrees: Worktree[];
	searchValue: string;
	onSearchChange: (value: string) => void;
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onOpenWorktree: (worktreeId: string, branch: string) => void;
	disabled: boolean;
}

export function WorktreesSection({
	closedWorktrees,
	openWorktrees,
	searchValue,
	onSearchChange,
	isOpen,
	onOpenChange,
	onOpenWorktree,
	disabled,
}: WorktreesSectionProps) {
	const allWorktrees = [...closedWorktrees, ...openWorktrees];
	const filteredWorktrees = searchValue
		? allWorktrees.filter((wt) =>
				wt.branch.toLowerCase().includes(searchValue.toLowerCase()),
			)
		: allWorktrees;

	const filteredClosed = filteredWorktrees.filter(
		(wt) => !wt.hasActiveWorkspace,
	);
	const filteredOpen = filteredWorktrees.filter((wt) => wt.hasActiveWorkspace);

	return (
		<div className="space-y-1.5">
			<div className="border-t border-border pt-2" />
			<div className="text-[10px] text-muted-foreground/60 uppercase tracking-wider px-2">
				Worktrees
			</div>
			<Popover open={isOpen} onOpenChange={onOpenChange} modal={false}>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						className="w-full h-8 justify-between font-normal"
						disabled={disabled}
					>
						<span className="flex items-center gap-2 truncate">
							<LuGitBranch className="size-3.5 shrink-0 text-muted-foreground" />
							<span className="truncate text-sm text-muted-foreground">
								Select worktree...
							</span>
						</span>
						<HiChevronUpDown className="size-4 shrink-0 text-muted-foreground" />
					</Button>
				</PopoverTrigger>
				<PopoverContent
					className="w-[--radix-popover-trigger-width] p-0"
					align="start"
					onWheel={(e) => e.stopPropagation()}
				>
					<Command shouldFilter={false}>
						<CommandInput
							placeholder="Search worktrees..."
							value={searchValue}
							onValueChange={onSearchChange}
						/>
						<CommandList className="max-h-[200px]">
							<CommandEmpty>No worktrees found</CommandEmpty>
							{filteredClosed.length > 0 && (
								<CommandGroup>
									{filteredClosed.map((wt) => (
										<CommandItem
											key={wt.id}
											value={wt.id}
											onSelect={() => onOpenWorktree(wt.id, wt.branch)}
											className="flex flex-col items-start gap-0.5"
										>
											<span className="flex items-center gap-2 w-full">
												<LuGitBranch className="size-3.5 shrink-0 text-muted-foreground" />
												<span className="flex-1 truncate text-xs font-mono">
													{wt.branch}
												</span>
												<span className="text-[10px] text-muted-foreground shrink-0">
													{formatDistanceToNow(wt.createdAt, {
														addSuffix: false,
													})}
												</span>
											</span>
											<span className="text-[10px] text-muted-foreground/60 truncate w-full pl-5">
												{wt.path}
											</span>
										</CommandItem>
									))}
								</CommandGroup>
							)}
							{filteredOpen.length > 0 && (
								<CommandGroup heading="Already open">
									{filteredOpen.map((wt) => (
										<CommandItem
											key={wt.id}
											value={wt.id}
											disabled
											className="flex flex-col items-start gap-0.5 opacity-50"
										>
											<span className="flex items-center gap-2 w-full">
												<LuGitBranch className="size-3.5 shrink-0" />
												<span className="flex-1 truncate text-xs font-mono">
													{wt.branch}
												</span>
												<span className="text-[10px] shrink-0">open</span>
											</span>
											<span className="text-[10px] text-muted-foreground/60 truncate w-full pl-5">
												{wt.path}
											</span>
										</CommandItem>
									))}
								</CommandGroup>
							)}
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		</div>
	);
}

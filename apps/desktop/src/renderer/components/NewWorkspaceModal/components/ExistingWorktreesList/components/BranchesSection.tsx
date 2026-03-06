import { Button } from "@superset/ui/button";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { GoGitBranch } from "react-icons/go";
import { HiChevronUpDown } from "react-icons/hi2";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";

interface Branch {
	name: string;
	lastCommitDate: number;
	isLocal: boolean;
	isRemote: boolean;
}

interface BranchesSectionProps {
	branches: Branch[];
	defaultBranch: string | undefined;
	searchValue: string;
	onSearchChange: (value: string) => void;
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onSelectBranch: (branchName: string) => void;
	disabled: boolean;
}

export function BranchesSection({
	branches,
	defaultBranch,
	searchValue,
	onSearchChange,
	isOpen,
	onOpenChange,
	onSelectBranch,
	disabled,
}: BranchesSectionProps) {
	return (
		<div className="space-y-1.5">
			<Popover open={isOpen} onOpenChange={onOpenChange} modal={false}>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						className="w-full h-8 justify-between font-normal"
						disabled={disabled}
					>
						<span className="flex items-center gap-2 shrink-0 min-w-0">
							<GoGitBranch className="size-3.5 shrink-0 text-muted-foreground" />
							<span className="truncate text-sm text-muted-foreground">
								Select branch...
							</span>
						</span>
						<HiChevronUpDown className="size-4 shrink-0 text-muted-foreground ml-2" />
					</Button>
				</PopoverTrigger>
				<PopoverContent
					className="w-[--radix-popover-trigger-width] p-0"
					align="start"
					onWheel={(e) => e.stopPropagation()}
				>
					<Command shouldFilter={false}>
						<CommandInput
							placeholder="Search branches..."
							value={searchValue}
							onValueChange={onSearchChange}
						/>
						<CommandList className="max-h-[200px]">
							<CommandEmpty>No branches found</CommandEmpty>
							{branches.map((branch) => (
								<CommandItem
									key={branch.name}
									value={branch.name}
									onSelect={() => onSelectBranch(branch.name)}
									className="flex items-center justify-between"
								>
									<span className="flex items-center gap-2 truncate min-w-0">
										<GoGitBranch className="size-3.5 shrink-0 text-muted-foreground" />
										<span className="truncate">{branch.name}</span>
										{branch.name === defaultBranch && (
											<span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
												default
											</span>
										)}
										{!branch.isLocal && branch.isRemote && (
											<span className="text-[10px] text-muted-foreground/60 bg-muted/50 px-1.5 py-0.5 rounded shrink-0">
												remote
											</span>
										)}
									</span>
									{branch.lastCommitDate > 0 && (
										<span className="text-xs text-muted-foreground shrink-0 ml-2">
											{formatRelativeTime(branch.lastCommitDate)}
										</span>
									)}
								</CommandItem>
							))}
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		</div>
	);
}

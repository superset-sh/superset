import { Button } from "@superset/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Switch } from "@superset/ui/switch";
import { GoGitBranch } from "react-icons/go";
import {
	HiCheck,
	HiChevronDown,
	HiChevronUpDown,
	HiOutlinePencil,
} from "react-icons/hi2";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";

interface PromptGroupAdvancedOptionsProps {
	showAdvanced: boolean;
	onShowAdvancedChange: (open: boolean) => void;
	branchInputValue: string;
	onBranchInputChange: (value: string) => void;
	onBranchInputBlur: () => void;
	onEditPrefix: () => void;
	runSetupScript: boolean;
	onRunSetupScriptChange: (checked: boolean) => void;
	shortcutHint?: string;
	hideSetupScript?: boolean;
	isBranchesError?: boolean;
	isBranchesLoading?: boolean;
	compareBaseBranchOpen?: boolean;
	onCompareBaseBranchOpenChange?: (open: boolean) => void;
	effectiveCompareBaseBranch?: string | null;
	defaultBranch?: string;
	branchSearch?: string;
	onBranchSearchChange?: (search: string) => void;
	filteredBranches?: Array<{ name: string; lastCommitDate: number }>;
	onSelectCompareBaseBranch?: (branchName: string) => void;
}

export function PromptGroupAdvancedOptions({
	showAdvanced,
	onShowAdvancedChange,
	branchInputValue,
	onBranchInputChange,
	onBranchInputBlur,
	onEditPrefix,
	runSetupScript,
	onRunSetupScriptChange,
	shortcutHint,
	hideSetupScript,
	isBranchesError,
	isBranchesLoading,
	compareBaseBranchOpen,
	onCompareBaseBranchOpenChange,
	effectiveCompareBaseBranch,
	defaultBranch,
	branchSearch,
	onBranchSearchChange,
	filteredBranches,
	onSelectCompareBaseBranch,
}: PromptGroupAdvancedOptionsProps) {
	const showCompareBaseBranch = onCompareBaseBranchOpenChange != null;

	return (
		<Collapsible open={showAdvanced} onOpenChange={onShowAdvancedChange}>
			<div className="flex items-center justify-between">
				<CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
					<HiChevronDown
						className={`size-3 transition-transform ${showAdvanced ? "" : "-rotate-90"}`}
					/>
					Advanced options
				</CollapsibleTrigger>
				{shortcutHint && (
					<span className="text-[11px] text-muted-foreground/50">
						{shortcutHint}
					</span>
				)}
			</div>
			<CollapsibleContent className="pt-3 space-y-3">
				<div className="space-y-1.5">
					<div className="flex items-center justify-between">
						<label htmlFor="branch" className="text-xs text-muted-foreground">
							Branch name
						</label>
						<button
							type="button"
							onClick={onEditPrefix}
							className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
						>
							<HiOutlinePencil className="size-3" />
							<span>Edit prefix</span>
						</button>
					</div>
					<Input
						id="branch"
						className="h-8 text-sm font-mono"
						placeholder="auto-generated"
						value={branchInputValue}
						onChange={(event) => onBranchInputChange(event.target.value)}
						onBlur={onBranchInputBlur}
					/>
				</div>

				{showCompareBaseBranch && (
					<div className="space-y-1.5">
						<span className="text-xs text-muted-foreground">Base branch</span>
						{isBranchesError ? (
							<div className="flex items-center gap-2 h-8 px-3 rounded-md border border-destructive/50 bg-destructive/10 text-destructive text-xs">
								Failed to load branches
							</div>
						) : (
							<Popover
								open={compareBaseBranchOpen}
								onOpenChange={onCompareBaseBranchOpenChange}
								modal={false}
							>
								<PopoverTrigger asChild>
									<Button
										variant="outline"
										size="sm"
										className="w-full h-8 justify-between font-normal"
										disabled={isBranchesLoading}
									>
										<span className="flex items-center gap-2 truncate">
											<GoGitBranch className="size-3.5 shrink-0 text-muted-foreground" />
											<span className="truncate font-mono text-sm">
												{effectiveCompareBaseBranch || "Select branch..."}
											</span>
											{effectiveCompareBaseBranch === defaultBranch && (
												<span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
													default
												</span>
											)}
										</span>
										<HiChevronUpDown className="size-4 shrink-0 text-muted-foreground" />
									</Button>
								</PopoverTrigger>
								<PopoverContent
									className="w-[--radix-popover-trigger-width] p-0"
									align="start"
									onWheel={(event) => event.stopPropagation()}
								>
									<Command shouldFilter={false}>
										<CommandInput
											placeholder="Search branches..."
											value={branchSearch}
											onValueChange={onBranchSearchChange}
										/>
										<CommandList className="max-h-[200px]">
											<CommandEmpty>No branches found</CommandEmpty>
											{filteredBranches?.map((branch) => (
												<CommandItem
													key={branch.name}
													value={branch.name}
													onSelect={() =>
														onSelectCompareBaseBranch?.(branch.name)
													}
													className="flex items-center justify-between"
												>
													<span className="flex items-center gap-2 truncate">
														<GoGitBranch className="size-3.5 shrink-0 text-muted-foreground" />
														<span className="truncate">{branch.name}</span>
														{branch.name === defaultBranch && (
															<span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
																default
															</span>
														)}
													</span>
													<span className="flex items-center gap-2 shrink-0">
														{branch.lastCommitDate > 0 && (
															<span className="text-xs text-muted-foreground">
																{formatRelativeTime(branch.lastCommitDate)}
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
						)}
					</div>
				)}

				{!hideSetupScript && (
					<div className="flex items-center justify-between">
						<Label
							htmlFor="run-setup-script"
							className="text-xs text-muted-foreground"
						>
							Run setup script
						</Label>
						<Switch
							id="run-setup-script"
							checked={runSetupScript}
							onCheckedChange={onRunSetupScriptChange}
						/>
					</div>
				)}
			</CollapsibleContent>
		</Collapsible>
	);
}

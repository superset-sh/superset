import { Trans, useLingui } from "@lingui/react/macro";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useState } from "react";
import { HiCheck, HiChevronUpDown } from "react-icons/hi2";
import { LuGitBranch } from "react-icons/lu";
import { FormPickerTrigger } from "../FormPickerTrigger";

export interface RepositoryOption {
	id: string;
	fullName: string;
}

interface RepositoryPickerPillProps {
	selectedIds: string[];
	repositories: RepositoryOption[];
	isLoading: boolean;
	onChange: (repositoryIds: string[]) => void;
}

/**
 * Which repositories a cloud workspace checks out, for an environment that
 * fixes none of its own. Several can be picked; the workspace opens on the
 * first by name.
 */
export function RepositoryPickerPill({
	selectedIds,
	repositories,
	isLoading,
	onChange,
}: RepositoryPickerPillProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const selected = selectedIds
		.map((id) => repositories.find((repo) => repo.id === id))
		.filter((repo): repo is RepositoryOption => repo !== undefined);
	const label =
		selected.length === 0
			? t({ message: "Select repository" })
			: selected.length === 1
				? (selected[0]?.fullName ?? "")
				: t({ message: `${selected[0]?.fullName} +${selected.length - 1}` });

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<FormPickerTrigger className="max-w-[220px]">
					<LuGitBranch className="size-4 shrink-0 text-muted-foreground" />
					<span className="truncate">{label}</span>
					<HiChevronUpDown className="size-3 shrink-0" />
				</FormPickerTrigger>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-72 p-0"
				onWheel={(event) => event.stopPropagation()}
			>
				<Command>
					<CommandInput
						placeholder={t({ message: "Search repositories..." })}
					/>
					<CommandList className="max-h-[min(280px,var(--radix-popover-content-available-height))]">
						<CommandEmpty>
							{isLoading ? (
								<Trans>Loading repositories...</Trans>
							) : (
								<Trans>No repositories connected.</Trans>
							)}
						</CommandEmpty>
						<CommandGroup>
							{repositories.map((repository) => {
								const checked = selectedIds.includes(repository.id);
								return (
									<CommandItem
										key={repository.id}
										value={repository.fullName}
										onSelect={() =>
											onChange(
												checked
													? selectedIds.filter((id) => id !== repository.id)
													: [...selectedIds, repository.id],
											)
										}
									>
										<LuGitBranch className="size-4 text-muted-foreground" />
										<span className="flex-1 truncate">
											{repository.fullName}
										</span>
										{checked && <HiCheck className="size-4 shrink-0" />}
									</CommandItem>
								);
							})}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

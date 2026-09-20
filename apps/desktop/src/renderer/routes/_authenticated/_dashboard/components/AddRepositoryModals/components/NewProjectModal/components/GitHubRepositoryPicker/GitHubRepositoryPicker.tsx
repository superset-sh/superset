import { Trans, useLingui } from "@lingui/react/macro";
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
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { HiCheck } from "react-icons/hi2";
import { LuChevronsUpDown, LuGithub } from "react-icons/lu";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

interface GitHubRepositoryPickerProps {
	disabled: boolean;
	hostUrl: string | null;
	onSelect: (repository: { cloneUrl: string; fullName: string }) => void;
	selectedFullName: string | null;
}

export function GitHubRepositoryPicker({
	disabled,
	hostUrl,
	onSelect,
	selectedFullName,
}: GitHubRepositoryPickerProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const repositoriesQuery = useQuery({
		queryKey: ["github-repositories", hostUrl],
		queryFn: () => {
			if (!hostUrl) throw new Error("No active host");
			return getHostServiceClientByUrl(
				hostUrl,
			).project.listGitHubRepositories.query();
		},
		enabled: open && !disabled && hostUrl !== null,
		staleTime: 60_000,
	});
	const repositories = repositoriesQuery.data ?? [];

	return (
		<div className="flex flex-col gap-1.5">
			<span className="text-xs font-medium">
				<Trans>Repositories</Trans>
			</span>
			<Popover onOpenChange={setOpen} open={open}>
				<PopoverTrigger asChild>
					<Button
						className="justify-between font-normal"
						disabled={disabled || !hostUrl}
						variant="outline"
					>
						{selectedFullName ? (
							<>
								<span className="flex min-w-0 items-center gap-2">
									<LuGithub className="size-4 shrink-0 text-muted-foreground" />
									<span className="truncate">{selectedFullName}</span>
								</span>
								<HiCheck className="size-4 shrink-0 text-muted-foreground" />
							</>
						) : (
							<>
								<span className="text-muted-foreground">
									<Trans>Select repositories</Trans>
								</span>
								<LuChevronsUpDown className="size-4 shrink-0 opacity-50" />
							</>
						)}
					</Button>
				</PopoverTrigger>
				<PopoverContent
					align="start"
					className="w-[var(--radix-popover-trigger-width)] p-0"
				>
					<Command>
						<CommandInput
							placeholder={t({ message: "Search repositories..." })}
						/>
						<CommandList className="max-h-64">
							<CommandEmpty>
								{repositoriesQuery.isLoading ? (
									<Trans>Loading repositories...</Trans>
								) : repositoriesQuery.isError ? (
									repositoriesQuery.error.message
								) : (
									<Trans>No matches</Trans>
								)}
							</CommandEmpty>
							<CommandGroup>
								{repositories.map((repository) => {
									const selected = repository.fullName === selectedFullName;
									return (
										<CommandItem
											key={repository.fullName}
											onSelect={() => {
												onSelect(repository);
												setOpen(false);
											}}
											value={repository.fullName}
										>
											<LuGithub className="size-4 shrink-0 text-muted-foreground" />
											<span className="flex-1 truncate">
												{repository.fullName}
											</span>
											{selected && (
												<HiCheck className="size-4 shrink-0 text-muted-foreground" />
											)}
										</CommandItem>
									);
								})}
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		</div>
	);
}

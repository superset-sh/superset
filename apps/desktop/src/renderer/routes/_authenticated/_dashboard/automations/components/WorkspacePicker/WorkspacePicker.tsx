import type { SelectV2Workspace } from "@superset/db/schema";
import {
	Command,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo, useState } from "react";
import { HiCheck } from "react-icons/hi2";
import { LuGitBranch, LuSparkles } from "react-icons/lu";
import { PickerTrigger } from "renderer/components/PickerTrigger";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

interface WorkspacePickerProps {
	hostId: string | null;
	projectId: string | null;
	value: string | null;
	onChange: (workspaceId: string | null) => void;
	className?: string;
}

export function WorkspacePicker({
	hostId,
	projectId,
	value,
	onChange,
	className,
}: WorkspacePickerProps) {
	const [open, setOpen] = useState(false);
	const collections = useCollections();

	const { data: allWorkspaces = [] } = useLiveQuery(
		(q) =>
			q
				.from({ w: collections.v2Workspaces })
				.orderBy(({ w }) => w.createdAt, "desc")
				.select(({ w }) => ({ ...w })),
		[collections.v2Workspaces],
	);

	const workspaces = useMemo(() => {
		const rows = allWorkspaces as SelectV2Workspace[];
		if (!hostId || !projectId) return [];
		return rows.filter((w) => w.hostId === hostId && w.projectId === projectId);
	}, [allWorkspaces, hostId, projectId]);

	const selected = value ? workspaces.find((w) => w.id === value) : null;
	const label = selected ? selected.name : "New workspace";

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<PickerTrigger
					className={className}
					icon={
						selected ? (
							<LuGitBranch className="size-4 shrink-0" />
						) : (
							<LuSparkles className="size-4 shrink-0" />
						)
					}
					label={label}
				/>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				side="top"
				sideOffset={8}
				className="w-60 p-0"
			>
				<Command>
					<CommandInput placeholder="Search workspaces..." />
					<CommandList>
						<CommandGroup>
							<CommandItem
								value="__new__"
								onSelect={() => {
									onChange(null);
									setOpen(false);
								}}
							>
								<LuSparkles className="size-4" />
								<span>New workspace</span>
								{!selected && <HiCheck className="ml-auto size-4" />}
							</CommandItem>
							{workspaces.map((workspace) => (
								<CommandItem
									key={workspace.id}
									value={workspace.name}
									onSelect={() => {
										onChange(workspace.id);
										setOpen(false);
									}}
								>
									<LuGitBranch className="size-4" />
									<span className="truncate">{workspace.name}</span>
									{workspace.id === selected?.id && (
										<HiCheck className="ml-auto size-4" />
									)}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

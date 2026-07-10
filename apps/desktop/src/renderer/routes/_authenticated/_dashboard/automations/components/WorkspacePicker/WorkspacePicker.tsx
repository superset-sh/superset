import type { SelectV2Host } from "@superset/db/schema";
import {
	Command,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo, useState } from "react";
import { HiCheck } from "react-icons/hi2";
import { LuGitBranch, LuSparkles, LuTriangleAlert } from "react-icons/lu";
import { PickerTrigger } from "renderer/components/PickerTrigger";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";

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

	const { workspaces: hostWorkspaces, isReady } = useHostWorkspaces();
	const workspaceRows = useMemo(
		() =>
			[...hostWorkspaces].sort(
				(a, b) =>
					new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
			),
		[hostWorkspaces],
	);

	const { data: allHosts = [] } = useLiveQuery(
		(q) => q.from({ h: collections.v2Hosts }).select(({ h }) => ({ ...h })),
		[collections.v2Hosts],
	);

	const hostRows = allHosts as SelectV2Host[];

	const workspaces = useMemo(
		() =>
			hostId && projectId
				? workspaceRows.filter(
						(w) => w.hostId === hostId && w.projectId === projectId,
					)
				: [],
		[workspaceRows, hostId, projectId],
	);

	// Resolve the pinned workspace from the FULL list, not the host-scoped
	// subset: a workspace pinned to a different device must stay visible here
	// instead of silently masquerading as "New workspace" (which hides the
	// mismatch and lets dispatch keep failing with "Workspace not found").
	const selected = value
		? (workspaceRows.find((w) => w.id === value) ?? null)
		: null;
	const offScope =
		!!selected &&
		(selected.hostId !== hostId || selected.projectId !== projectId);
	const offScopeHostName = offScope
		? (hostRows.find((h) => h.machineId === selected.hostId)?.name ??
			"another device")
		: null;
	// A pinned value we can't resolve yet (live query still hydrating) is loading,
	// not an empty "New workspace" selection — don't flash the wrong label/warning.
	const resolving = !!value && !selected && !isReady;
	const label = selected
		? selected.name
		: resolving
			? "Loading…"
			: "New workspace";

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<PickerTrigger
					className={cn(offScope && "text-amber-500", className)}
					icon={
						offScope ? (
							<LuTriangleAlert className="size-4 shrink-0" />
						) : selected || resolving ? (
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
								{!selected && !resolving && (
									<HiCheck className="ml-auto size-4" />
								)}
							</CommandItem>
							{offScope && selected && (
								<CommandItem
									value={`__pinned__${selected.id}`}
									keywords={[selected.name]}
									onSelect={() => setOpen(false)}
									className="text-amber-500"
								>
									<LuTriangleAlert className="size-4" />
									<span className="flex min-w-0 flex-col">
										<span className="truncate">{selected.name}</span>
										<span className="truncate text-[10px] text-amber-500/70">
											on {offScopeHostName} — won't run here
										</span>
									</span>
									<HiCheck className="ml-auto size-4" />
								</CommandItem>
							)}
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

import { Trans, useLingui } from "@lingui/react/macro";
import {
	Command,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import { useMemo, useState } from "react";
import { HiCheck } from "react-icons/hi2";
import { LuGitBranch, LuSparkles, LuTriangleAlert } from "react-icons/lu";
import { PickerTrigger } from "renderer/components/PickerTrigger";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";

interface WorkspacePickerProps {
	hostId: string | null;
	/**
	 * Null = session mode (list session workspaces, offer "New session").
	 * Undefined = no project chosen yet — render neutral "New workspace" copy
	 * and list nothing, so the pre-default loading window never looks like
	 * session mode.
	 */
	projectId: string | null | undefined;
	value: string | null;
	onChange: (workspaceId: string | null) => void;
	className?: string;
	disabled?: boolean;
}

export function WorkspacePicker({
	hostId,
	projectId,
	value,
	onChange,
	className,
	disabled,
}: WorkspacePickerProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);

	const { workspaces: hostWorkspaces, isReady } = useHostWorkspaces();
	const workspaceRows = useMemo(
		() =>
			[...hostWorkspaces].sort(
				(a, b) =>
					new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
			),
		[hostWorkspaces],
	);

	const { data: hostRows = [] } = cloudTrpc.v2Host.list.useQuery(undefined);

	// Null projectId = session mode: offer the host's session workspaces
	// (projectId null) as pin targets.
	const workspaces = useMemo(
		() =>
			hostId && projectId !== undefined
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
			t({
				message: "another device",
			}))
		: null;
	// A pinned value we can't resolve yet (live query still hydrating) is loading,
	// not an empty "New workspace" selection — don't flash the wrong label/warning.
	const resolving = !!value && !selected && !isReady;
	// Pinned to a workspace no host list resolves — deleted, or an unreachable
	// host with no cached snapshot. Never render this as "New workspace": that
	// hides the broken pin while dispatch keeps failing.
	const missing = !!value && !selected && isReady;
	const label = selected
		? selected.name
		: resolving
			? t({
					message: "Loading…",
				})
			: missing
				? t({
						message: "Workspace not found",
					})
				: projectId === null
					? t({
							message: "New session",
						})
					: t({
							message: "New workspace",
						});

	return (
		// Guard the open state, not just the trigger: Radix opens on pointerdown,
		// which Chromium still dispatches to fieldset-disabled buttons.
		<Popover open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
			<PopoverTrigger asChild>
				<PickerTrigger
					disabled={disabled}
					className={cn((offScope || missing) && "text-amber-500", className)}
					icon={
						offScope || missing ? (
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
					<CommandInput
						placeholder={t({
							message: "Search workspaces...",
						})}
					/>
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
								<span>
									{projectId === null ? (
										<Trans>New session</Trans>
									) : (
										<Trans>New workspace</Trans>
									)}
								</span>
								{!selected && !resolving && !missing && (
									<HiCheck className="ml-auto size-4" />
								)}
							</CommandItem>
							{missing && (
								<CommandItem
									value="__deleted__"
									onSelect={() => setOpen(false)}
									className="text-amber-500"
								>
									<LuTriangleAlert className="size-4" />
									<span className="flex min-w-0 flex-col select-text cursor-text">
										<span className="truncate">
											<Trans>Workspace not found</Trans>
										</span>
										<span className="truncate text-[10px] text-amber-500/70">
											<Trans>deleted or unavailable — pick another</Trans>
										</span>
									</span>
									<HiCheck className="ml-auto size-4" />
								</CommandItem>
							)}
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
											<Trans>on {offScopeHostName} — won't run here</Trans>
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

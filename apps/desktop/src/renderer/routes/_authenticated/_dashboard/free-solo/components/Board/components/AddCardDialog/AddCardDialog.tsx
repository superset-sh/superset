import { AGENT_IDENTITY_LABELS } from "@superset/shared/agent-catalog";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { toast } from "@superset/ui/sonner";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo, useState } from "react";
import { HiArrowLeft } from "react-icons/hi2";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { deriveTerminalAgentStatus } from "renderer/hooks/host-service/useTerminalAgentStatuses";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { resolvePresetLaunchCommands } from "renderer/lib/agent-launch-command";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { resolveV2PresetIcon } from "renderer/lib/preset-icon";
import { buildTerminalCommand } from "renderer/lib/terminal/launch-command";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import {
	MAX_CARDS,
	useFreeSoloBoardStore,
} from "renderer/stores/free-solo-board";
import { useV2NotificationStore } from "renderer/stores/v2-notifications";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates";
import { presetMatchesProjectId } from "shared/preset-project-targeting";
import type { HostAgentBinding, HostSession } from "../HostTerminalsProbe";
import { mergeHostAgentSessions } from "./utils/mergeHostAgentSessions";

/** Mirrors `useV2TerminalLauncher`'s create timeout: worst case is a daemon
 *  bootstrap (5s connect + 15s open) plus a shell env probe (8s), so
 *  anything past this is a wedged transport rather than legitimate work. */
const CREATE_SESSION_TIMEOUT_MS = 30_000;

function agentLabelFor(agentId: string): string {
	return (AGENT_IDENTITY_LABELS as Record<string, string>)[agentId] ?? agentId;
}

interface AddCardDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Every host URL Board currently has a probe mounted for. */
	hostUrls: string[];
	/** Keyed by hostUrl, owned by Board (it mounts the probes and shares this
	 *  with reconciliation). Absent = still loading, null = that host's probe
	 *  settled into an error, an array = its live session list. Kept
	 *  distinct so the dialog can tell "still checking" from "came back
	 *  empty" from "couldn't check" instead of silently rendering a short
	 *  list as if it were the complete one. */
	sessionsByHost: Record<string, HostSession[] | null>;
	/** Same contract as `sessionsByHost`, for each host's live
	 *  terminal-agent bindings. */
	bindingsByHost: Record<string, HostAgentBinding[] | null>;
}

export function AddCardDialog({
	open,
	onOpenChange,
	hostUrls,
	sessionsByHost,
	bindingsByHost,
}: AddCardDialogProps) {
	const { workspaces, cache } = useHostWorkspaces();
	const { projects } = useHostProjects();
	const { machineId, activeHostUrl } = useLocalHostService();
	const addCard = useFreeSoloBoardStore((state) => state.addCard);
	const cards = useFreeSoloBoardStore((state) => state.cards);
	const { submit } = useWorkspaceCreates();
	const isDark = useIsDarkTheme();
	const terminalSeenAt = useV2NotificationStore(
		(state) => state.terminalSeenAt,
	);

	// "Start an agent" step 2: null while browsing the root groups, a preset
	// once one is picked — swaps CommandList over to that preset's workspaces.
	const [selectedPreset, setSelectedPreset] =
		useState<V2TerminalPresetRow | null>(null);
	// cmdk keeps typed search text in the Command root, which CommandDialog
	// doesn't expose as a controllable prop — without resetting it here, the
	// step-2 workspace list would filter against whatever the user typed
	// while browsing presets. Controlled (rather than remounting the whole
	// CommandDialog on step change, which was tried first and unmounted the
	// live Radix Dialog/cmdk tree mid-interaction).
	const [search, setSearch] = useState("");
	const goToPresetStep = (preset: V2TerminalPresetRow) => {
		setSelectedPreset(preset);
		setSearch("");
	};
	const resetToRootStep = () => {
		setSelectedPreset(null);
		setSearch("");
	};
	const handleOpenChange = (nextOpen: boolean) => {
		onOpenChange(nextOpen);
		// Closed dialog always reopens on the root step, never mid-wizard.
		if (!nextOpen) resetToRootStep();
	};

	const collections = useCollections();
	const { data: presets = [] } = useLiveQuery(
		(query) =>
			query
				.from({ v2TerminalPresets: collections.v2TerminalPresets })
				.orderBy(({ v2TerminalPresets }) => v2TerminalPresets.tabOrder),
		[collections],
	);
	// Same source `useV2PresetExecution` resolves commands against: the local
	// host's agent configs, regardless of which host the launched workspace
	// actually lives on. A remote workspace's own command overrides (if any)
	// don't apply here — this mirrors the existing preset-execution hook
	// rather than inventing a per-workspace resolution.
	const { data: agents = [] } = useV2AgentConfigs(activeHostUrl);

	// A workspace whose host has no resolvable URL at all can't be probed —
	// no HostTerminalsProbe gets mounted for it, so it never contributes a
	// sessionsByHost entry. Count those hosts alongside ones whose probe
	// mounted but errored: both mean the "Running terminals" list below is
	// missing data, not that the missing host simply has nothing running.
	const unresolvedHostCount = useMemo(() => {
		const ids = new Set<string>();
		for (const workspace of workspaces) {
			if (!cache.resolveHostUrl(workspace.hostId)) ids.add(workspace.hostId);
		}
		return ids.size;
	}, [workspaces, cache]);
	const pendingHostCount = hostUrls.filter(
		(url) => sessionsByHost[url] === undefined,
	).length;
	const erroredHostCount = hostUrls.filter(
		(url) => sessionsByHost[url] === null,
	).length;
	const unreachableHostCount = unresolvedHostCount + erroredHostCount;

	const boardedTerminalIds = new Set(cards.map((card) => card.terminalId));
	const isFull = cards.length >= MAX_CARDS;
	// Read through the *current* hostUrls only — a stale key left behind by a
	// host whose URL changed (host-service restarts move ports) would
	// otherwise double up its sessions under two different keys.
	const sessions = hostUrls.flatMap((url) => sessionsByHost[url] ?? []);
	const bindings = hostUrls.flatMap((url) => bindingsByHost[url] ?? []);
	const { agentSessions, terminalSessions } = mergeHostAgentSessions(
		sessions,
		bindings,
	);
	const workspaceById = new Map(
		workspaces.map((workspace) => [workspace.id, workspace]),
	);
	const projectNameFor = (workspace: {
		projectId: string | null;
	}): string | undefined =>
		workspace.projectId
			? projects.find((project) => project.projectKey === workspace.projectId)
					?.name
			: "Session";

	const workspacesForPreset = useMemo(() => {
		if (!selectedPreset) return [];
		return workspaces.filter((workspace) =>
			presetMatchesProjectId(selectedPreset, workspace.projectId),
		);
	}, [workspaces, selectedPreset]);

	const add = (
		workspaceId: string,
		terminalId: string,
		createOnAttach?: boolean,
	) => {
		addCard({ workspaceId, terminalId, createOnAttach });
		onOpenChange(false);
	};

	const addScratchSession = () => {
		const handle = submit({
			// The local machine, not any workspace's own host — a scratch
			// session always lives where the desktop app is running.
			hostId: machineId,
			snapshot: {
				id: crypto.randomUUID(),
				projectId: null,
				name: "Free Solo session",
			},
		});
		onOpenChange(false);
		toast.promise(
			handle.completed.then((outcome) => {
				if (!outcome.ok) throw new Error(outcome.error);
				// The session is a real workspace now regardless of what
				// happens next — the board never deletes workspaces, so a
				// full board here just means "created, but not added".
				const cardId = addCard({
					workspaceId: outcome.workspaceId,
					terminalId: crypto.randomUUID(),
					createOnAttach: true,
				});
				if (cardId === null) {
					throw new Error(
						"Session created, but the board filled up before it could be added — find it in the sidebar.",
					);
				}
			}),
			{
				loading: "Creating session…",
				success: "Session created",
				error: (error) =>
					error instanceof Error ? error.message : String(error),
			},
		);
	};

	// Unlike `add` above, this one has to await creation — the initial command
	// has to be attached at spawn, so there's no create-on-attach shortcut.
	const launchPreset = (preset: V2TerminalPresetRow, workspaceId: string) => {
		const workspace = workspaceById.get(workspaceId);
		const hostUrl = workspace && cache.resolveHostUrl(workspace.hostId);
		if (!hostUrl) {
			toast.error("Host unreachable");
			return;
		}
		onOpenChange(false);
		resetToRootStep();

		const terminalId = crypto.randomUUID();
		const commands = resolvePresetLaunchCommands(preset, agents);
		const initialCommand = buildTerminalCommand(commands) ?? undefined;
		const cwd = preset.cwd.trim() || undefined;

		const client = getHostServiceClientByUrl(hostUrl);
		toast.promise(
			client.terminal.createSession
				.mutate(
					{ terminalId, workspaceId, initialCommand, cwd },
					{ signal: AbortSignal.timeout(CREATE_SESSION_TIMEOUT_MS) },
				)
				.then(() => {
					const cardId = addCard({ workspaceId, terminalId });
					if (cardId === null) {
						throw new Error(
							"Agent started, but the board filled up before it could be added — find it in the sidebar.",
						);
					}
				}),
			{
				loading: `Starting ${preset.name || "agent"}…`,
				success: "Agent started",
				error: (error) =>
					error instanceof Error ? error.message : String(error),
			},
		);
	};

	const selectedPresetName = selectedPreset?.name || "preset";

	return (
		<CommandDialog
			open={open}
			onOpenChange={handleOpenChange}
			title={
				selectedPreset
					? `Start "${selectedPresetName}" in…`
					: "Add a terminal to the board"
			}
			description={
				selectedPreset
					? "Pick a workspace to launch it in."
					: "Pick a running terminal or agent, start a new one, or spin up a scratch session."
			}
		>
			<CommandInput
				value={search}
				onValueChange={setSearch}
				placeholder={
					selectedPreset
						? "Search workspaces…"
						: "Search terminals, agents, and workspaces…"
				}
			/>
			{!selectedPreset && pendingHostCount > 0 && (
				<p className="border-b px-3 py-1.5 text-xs text-muted-foreground">
					Checking {pendingHostCount} host
					{pendingHostCount === 1 ? "" : "s"}…
				</p>
			)}
			{!selectedPreset && unreachableHostCount > 0 && (
				<p className="border-b px-3 py-1.5 text-xs text-muted-foreground">
					{unreachableHostCount} host
					{unreachableHostCount === 1 ? "" : "s"} unreachable — their running
					terminals aren't listed.
				</p>
			)}
			<CommandList>
				<CommandEmpty>Nothing found.</CommandEmpty>
				{selectedPreset ? (
					<CommandGroup heading={`Start "${selectedPresetName}" in…`}>
						<CommandItem value="back" onSelect={resetToRootStep}>
							<HiArrowLeft className="size-3.5 shrink-0" />
							<span className="truncate">Back to presets</span>
						</CommandItem>
						{workspacesForPreset.map((workspace) => {
							const disabled = isFull || !workspace.hostReachable;
							const reason = !workspace.hostReachable
								? "Host unreachable"
								: isFull
									? "Board is full"
									: null;
							return (
								<CommandItem
									key={workspace.id}
									value={`${workspace.name} ${workspace.id}`}
									disabled={disabled}
									onSelect={() => launchPreset(selectedPreset, workspace.id)}
								>
									<span className="truncate">{workspace.name}</span>
									{reason && (
										<span className="ml-auto text-xs text-muted-foreground">
											{reason}
										</span>
									)}
								</CommandItem>
							);
						})}
					</CommandGroup>
				) : (
					<>
						<CommandGroup heading="Running agents">
							{agentSessions.map((agentSession) => {
								const workspace = workspaceById.get(agentSession.workspaceId);
								if (!workspace) return null;
								const alreadyOnBoard = boardedTerminalIds.has(
									agentSession.terminalId,
								);
								const disabled = alreadyOnBoard || isFull;
								const reason = alreadyOnBoard
									? "On the board"
									: isFull
										? "Board is full"
										: null;
								const agentLabel = agentLabelFor(agentSession.agentId);
								const iconSrc = getPresetIcon(agentSession.agentId, isDark);
								const status = deriveTerminalAgentStatus({
									lastEventType: agentSession.lastEventType,
									lastEventAt: agentSession.lastEventAt,
									lastSeenAt: terminalSeenAt[agentSession.terminalId],
								});
								return (
									<CommandItem
										key={agentSession.terminalId}
										value={`${workspace.name} ${agentLabel} ${agentSession.title ?? ""} ${agentSession.terminalId}`}
										disabled={disabled}
										onSelect={() => add(workspace.id, agentSession.terminalId)}
									>
										{iconSrc && (
											<img
												src={iconSrc}
												alt=""
												className="size-3.5 shrink-0"
												draggable={false}
											/>
										)}
										<span className="shrink-0 text-muted-foreground">
											{projectNameFor(workspace)}
										</span>
										<span className="truncate font-medium">
											{workspace.name}
										</span>
										<span className="truncate text-muted-foreground">
											{agentLabel}
											{agentSession.title ? ` — ${agentSession.title}` : ""}
										</span>
										{status !== "idle" && (
											<StatusIndicator status={status} className="shrink-0" />
										)}
										{reason && (
											<span className="ml-auto shrink-0 text-xs text-muted-foreground">
												{reason}
											</span>
										)}
									</CommandItem>
								);
							})}
						</CommandGroup>
						<CommandGroup heading="Running terminals">
							{terminalSessions.map((session) => {
								const workspace = workspaceById.get(session.workspaceId);
								if (!workspace) return null;
								const alreadyOnBoard = boardedTerminalIds.has(
									session.terminalId,
								);
								const disabled = alreadyOnBoard || isFull;
								// A disabled CommandItem gets pointer-events: none (see
								// command.tsx), so a `title` tooltip on it would never fire —
								// the reason has to be visible text instead.
								const reason = alreadyOnBoard
									? "On the board"
									: isFull
										? "Board is full"
										: null;
								return (
									<CommandItem
										key={session.terminalId}
										value={`${workspace.name} ${session.title ?? ""} ${session.terminalId}`}
										disabled={disabled}
										onSelect={() => add(workspace.id, session.terminalId)}
									>
										<span className="truncate">
											{workspace.name} — {session.title ?? "Terminal"}
										</span>
										{reason && (
											<span className="ml-auto text-xs text-muted-foreground">
												{reason}
											</span>
										)}
									</CommandItem>
								);
							})}
						</CommandGroup>
						<CommandGroup heading="New terminal in…">
							{workspaces.map((workspace) => {
								const disabled = isFull || !workspace.hostReachable;
								const reason = !workspace.hostReachable
									? "Host unreachable"
									: isFull
										? "Board is full"
										: null;
								return (
									<CommandItem
										key={workspace.id}
										value={`new ${workspace.name} ${workspace.id}`}
										disabled={disabled}
										onSelect={() =>
											// Mint the id here and let the WS attach create the
											// session host-side — no launcher, no awaited mutation.
											add(workspace.id, crypto.randomUUID(), true)
										}
									>
										<span className="truncate">{workspace.name}</span>
										{reason && (
											<span className="ml-auto text-xs text-muted-foreground">
												{reason}
											</span>
										)}
									</CommandItem>
								);
							})}
						</CommandGroup>
						<CommandGroup heading="Start an agent">
							{presets.map((preset) => {
								const icon = resolveV2PresetIcon(preset, agents, isDark);
								const reason = isFull ? "Board is full" : null;
								return (
									<CommandItem
										key={preset.id}
										value={`start ${preset.name}`}
										disabled={isFull}
										onSelect={() => goToPresetStep(preset)}
									>
										{icon ? (
											<img
												src={icon}
												alt=""
												className="size-3.5 shrink-0"
												draggable={false}
											/>
										) : null}
										<span className="truncate">
											{preset.name || "Untitled preset"}
										</span>
										{reason && (
											<span className="ml-auto text-xs text-muted-foreground">
												{reason}
											</span>
										)}
									</CommandItem>
								);
							})}
						</CommandGroup>
						<CommandGroup heading="Scratch">
							<CommandItem
								value="empty session"
								disabled={isFull}
								onSelect={addScratchSession}
							>
								<span className="truncate">Empty session</span>
								{isFull && (
									<span className="ml-auto text-xs text-muted-foreground">
										Board is full
									</span>
								)}
							</CommandItem>
						</CommandGroup>
					</>
				)}
			</CommandList>
		</CommandDialog>
	);
}

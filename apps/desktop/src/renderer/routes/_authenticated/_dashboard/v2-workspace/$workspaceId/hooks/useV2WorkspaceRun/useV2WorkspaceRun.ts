import type { CreatePaneInput, WorkspaceStore } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useMemo, useRef, useState } from "react";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import { buildTerminalCommand } from "renderer/lib/terminal/launch-command";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type {
	V2TerminalPresetRow,
	WorkspaceRunTerminalState,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { selectWorkspaceRunDefinition } from "shared/workspace-run-definition";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData, TerminalPaneData } from "../../types";
import type { TerminalLauncher } from "../useV2TerminalLauncher";

const CTRL_C_INPUT = "\u0003";
const TERMINAL_GONE_ERROR_MESSAGES = [
	"Terminal session not found",
	"Terminal session has exited",
	"Terminal session does not belong to this workspace",
] as const;

function isTerminalGoneError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return TERMINAL_GONE_ERROR_MESSAGES.some((terminalMessage) =>
		message.includes(terminalMessage),
	);
}

function markStopped(
	state: WorkspaceRunTerminalState,
	stoppedAt: number,
	overrides?: Partial<
		Pick<WorkspaceRunTerminalState, "exitCode" | "signal" | "state">
	>,
) {
	state.state =
		overrides?.state ??
		(state.stopRequestedAt ? "stopped-by-user" : "stopped-by-exit");
	state.stoppedAt = stoppedAt;
	if (overrides?.exitCode !== undefined) state.exitCode = overrides.exitCode;
	if (overrides?.signal !== undefined) state.signal = overrides.signal;
}

function makeTerminalPane(
	terminalId: string,
	paneId: string,
): CreatePaneInput<PaneViewerData> {
	return {
		id: paneId,
		kind: "terminal",
		titleOverride: "Workspace Run",
		data: { terminalId } as TerminalPaneData,
	};
}

function getDefinitionId(
	definition: ReturnType<typeof selectWorkspaceRunDefinition>,
): string | undefined {
	if (!definition) return undefined;
	return definition.source === "terminal-preset"
		? definition.presetId
		: definition.projectId;
}

interface UseV2WorkspaceRunArgs {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	launcher: TerminalLauncher;
	matchedPresets: V2TerminalPresetRow[];
	resolvePresetCommands: (preset: V2TerminalPresetRow) => string[];
}

export function useV2WorkspaceRun({
	store,
	launcher,
	matchedPresets,
	resolvePresetCommands,
}: UseV2WorkspaceRunArgs) {
	const { workspace } = useWorkspace();
	const workspaceId = workspace.id;
	const projectId = workspace.projectId;
	const collections = useCollections();
	const [isPending, setIsPending] = useState(false);
	const isStartingRef = useRef(false);
	const utils = workspaceTrpc.useUtils();
	const writeInputMutation = workspaceTrpc.terminal.writeInput.useMutation();
	const killSessionMutation = workspaceTrpc.terminal.killSession.useMutation();
	const { data: localWorkspaceRows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ v2WorkspaceLocalState: collections.v2WorkspaceLocalState })
				.where(({ v2WorkspaceLocalState }) =>
					eq(v2WorkspaceLocalState.workspaceId, workspaceId),
				),
		[collections, workspaceId],
	);
	const localWorkspaceState = localWorkspaceRows[0] ?? null;
	const workspaceRunTerminals = useMemo(
		() => localWorkspaceState?.workspaceRunTerminals ?? {},
		[localWorkspaceState?.workspaceRunTerminals],
	);

	const { data: configRunDefinition } =
		workspaceTrpc.config.getWorkspaceRunDefinition.useQuery({ projectId });

	const resolvedMatchedPresets = useMemo(
		() =>
			matchedPresets.map((preset) => ({
				...preset,
				commands: resolvePresetCommands(preset),
			})),
		[matchedPresets, resolvePresetCommands],
	);

	const definition = useMemo(
		() =>
			selectWorkspaceRunDefinition({
				presets: resolvedMatchedPresets,
				configRunCommands: configRunDefinition?.commands,
				configCwd: configRunDefinition?.cwd,
				projectId,
			}),
		[
			configRunDefinition?.commands,
			configRunDefinition?.cwd,
			projectId,
			resolvedMatchedPresets,
		],
	);

	const runningState = useMemo(
		() =>
			Object.values(workspaceRunTerminals)
				.filter((state) => state.state === "running")
				.sort((a, b) => b.startedAt - a.startedAt)[0] ?? null,
		[workspaceRunTerminals],
	);

	const updateWorkspaceRunTerminals = useCallback(
		(updater: (states: Record<string, WorkspaceRunTerminalState>) => void) => {
			if (!collections.v2WorkspaceLocalState.get(workspaceId)) return;
			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				draft.workspaceRunTerminals ??= {};
				updater(draft.workspaceRunTerminals);
			});
		},
		[collections.v2WorkspaceLocalState, workspaceId],
	);

	const startWorkspaceRun = useCallback(async () => {
		if (isStartingRef.current) return;
		const command = buildTerminalCommand(definition?.commands);
		if (!definition || !command) {
			toast.error("No workspace run command configured", {
				description:
					"Add a run script in Project Settings or mark a preset as the workspace run.",
			});
			return;
		}

		isStartingRef.current = true;
		setIsPending(true);
		try {
			const terminalId = await launcher.create({
				command,
				cwd: definition.cwd,
			});
			const startedAt = Date.now();
			updateWorkspaceRunTerminals((states) => {
				states[terminalId] = {
					terminalId,
					workspaceId,
					state: "running",
					command,
					definitionSource: definition.source,
					definitionId: getDefinitionId(definition),
					startedAt,
				};
			});

			const tabId = crypto.randomUUID();
			const paneId = crypto.randomUUID();
			const pane = makeTerminalPane(terminalId, paneId);
			store.getState().addTab({ id: tabId, panes: [pane] });
		} catch (error) {
			toast.error("Failed to run workspace command", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		} finally {
			isStartingRef.current = false;
			setIsPending(false);
		}
	}, [definition, launcher, store, updateWorkspaceRunTerminals, workspaceId]);

	const stopWorkspaceRun = useCallback(async () => {
		if (!runningState) return;
		setIsPending(true);
		try {
			const stopRequestedAt = Date.now();
			await writeInputMutation.mutateAsync({
				terminalId: runningState.terminalId,
				workspaceId,
				data: CTRL_C_INPUT,
			});
			const stoppedAt = Date.now();
			updateWorkspaceRunTerminals((states) => {
				const state = states[runningState.terminalId];
				if (!state || state.state !== "running") return;
				state.stopRequestedAt = stopRequestedAt;
				markStopped(state, stoppedAt, { state: "stopped-by-user" });
			});
		} catch (error) {
			if (isTerminalGoneError(error)) {
				const stoppedAt = Date.now();
				updateWorkspaceRunTerminals((states) => {
					const state = states[runningState.terminalId];
					if (!state || state.state !== "running") return;
					markStopped(state, stoppedAt);
				});
				return;
			}

			updateWorkspaceRunTerminals((states) => {
				const state = states[runningState.terminalId];
				if (!state || state.state !== "running") return;
				delete state.stopRequestedAt;
			});
			toast.error("Failed to stop workspace run command", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		} finally {
			setIsPending(false);
		}
	}, [
		runningState,
		updateWorkspaceRunTerminals,
		workspaceId,
		writeInputMutation,
	]);

	const forceStopWorkspaceRun = useCallback(async () => {
		if (!runningState) return;
		setIsPending(true);
		try {
			await killSessionMutation.mutateAsync({
				terminalId: runningState.terminalId,
				workspaceId,
			});
			const stoppedAt = Date.now();
			updateWorkspaceRunTerminals((states) => {
				const state = states[runningState.terminalId];
				if (!state) return;
				state.stopRequestedAt ??= stoppedAt;
				markStopped(state, stoppedAt, { state: "stopped-by-user" });
			});
			await utils.terminal.listSessions.invalidate({ workspaceId });
		} catch (error) {
			if (isTerminalGoneError(error)) {
				const stoppedAt = Date.now();
				updateWorkspaceRunTerminals((states) => {
					const state = states[runningState.terminalId];
					if (!state || state.state !== "running") return;
					markStopped(state, stoppedAt);
				});
				await utils.terminal.listSessions.invalidate({ workspaceId });
				return;
			}

			toast.error("Failed to force stop workspace run command", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		} finally {
			setIsPending(false);
		}
	}, [
		killSessionMutation,
		runningState,
		updateWorkspaceRunTerminals,
		utils,
		workspaceId,
	]);

	const toggleWorkspaceRun = useCallback(async () => {
		if (runningState) {
			await stopWorkspaceRun();
			return;
		}
		await startWorkspaceRun();
	}, [runningState, startWorkspaceRun, stopWorkspaceRun]);

	useWorkspaceEvent("terminal:lifecycle", workspaceId, (payload) => {
		if (payload.eventType !== "exit") return;
		updateWorkspaceRunTerminals((states) => {
			const state = states[payload.terminalId];
			if (!state || state.state !== "running") return;
			markStopped(state, payload.occurredAt, {
				exitCode: payload.exitCode,
				signal: payload.signal,
			});
		});
	});

	return {
		canForceStop: Boolean(runningState),
		definition,
		forceStopWorkspaceRun,
		isPending,
		isRunning: Boolean(runningState),
		runningState,
		toggleWorkspaceRun,
	};
}

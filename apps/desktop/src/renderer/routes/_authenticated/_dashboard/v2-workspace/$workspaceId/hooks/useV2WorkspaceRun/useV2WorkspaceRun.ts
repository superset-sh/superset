import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { errorMessage, rawErrorMessage } from "@superset/i18n/errors";
import type { CreatePaneInput, WorkspaceStore } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useMemo, useRef, useState } from "react";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type {
	V2TerminalPresetRow,
	WorkspaceRunTerminalState,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import {
	planWorkspaceRunLaunch,
	selectWorkspaceRunDefinition,
} from "shared/workspace-run-definition";
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
	// Matches server wording, so it must see the raw English message — the
	// translated display string would break this under any other locale.
	const message = rawErrorMessage(error);
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
): CreatePaneInput<PaneViewerData> & { id: string } {
	return {
		id: paneId,
		kind: "terminal",
		titleOverride: i18n._(
			msg({
				message: "Workspace Run",
			}),
		),
		data: { terminalId } as TerminalPaneData,
	};
}

function findPriorRunPanes(
	state: WorkspaceStore<PaneViewerData>,
	priorRunTerminalIds: ReadonlySet<string>,
): { tabId: string; paneIds: [string, ...string[]] } | null {
	for (let i = state.tabs.length - 1; i >= 0; i--) {
		const tab = state.tabs[i];
		if (!tab) continue;
		const [first, ...rest] = Object.entries(tab.panes)
			.filter(([, pane]) => {
				if (pane.kind !== "terminal") return false;
				const terminalId = (pane.data as TerminalPaneData).terminalId;
				return Boolean(terminalId) && priorRunTerminalIds.has(terminalId);
			})
			.map(([paneId]) => paneId);
		if (first) return { tabId: tab.id, paneIds: [first, ...rest] };
	}
	return null;
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
	const { t } = useLingui();
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

	// Session workspaces (null projectId) have no project config; only global
	// terminal presets can define their run.
	const { data: configRunDefinition } =
		workspaceTrpc.config.getWorkspaceRunDefinition.useQuery(
			{ projectId: projectId ?? "" },
			{ enabled: projectId !== null },
		);

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

	const runningStates = useMemo(
		() =>
			Object.values(workspaceRunTerminals)
				.filter((state) => state.state === "running")
				.sort((a, b) => b.startedAt - a.startedAt),
		[workspaceRunTerminals],
	);
	const runningState = runningStates[0] ?? null;

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
		const launch = planWorkspaceRunLaunch(definition);
		if (!definition || !launch) {
			toast.error(
				t({
					message: "No workspace run command configured",
				}),
				{
					description: t({
						message:
							"Add a lifecycle run script in Project Settings or mark a terminal script as the workspace run.",
					}),
				},
			);
			return;
		}

		isStartingRef.current = true;
		setIsPending(true);
		try {
			// A terminal pane is a "workspace run" pane iff its terminalId is in
			// workspaceRunTerminals. Snapshot before launch so the new terminal
			// we're about to create doesn't itself match.
			const priorRunTerminalIds = new Set(Object.keys(workspaceRunTerminals));

			const terminalIds = await Promise.all(
				launch.commands.map((command) =>
					launcher.create({ command, cwd: definition.cwd }),
				),
			);
			const startedAt = Date.now();
			updateWorkspaceRunTerminals((states) => {
				terminalIds.forEach((terminalId, index) => {
					states[terminalId] = {
						terminalId,
						workspaceId,
						state: "running",
						command: launch.commands[index] ?? "",
						definitionSource: definition.source,
						definitionId: getDefinitionId(definition),
						startedAt,
					};
				});
			});

			const state = store.getState();
			const [firstPane, ...restPanes] = terminalIds.map((terminalId) =>
				makeTerminalPane(terminalId, crypto.randomUUID()),
			);
			if (!firstPane) return;
			const panes: [typeof firstPane, ...(typeof firstPane)[]] = [
				firstPane,
				...restPanes,
			];

			if (launch.layout === "tabs") {
				for (const pane of panes) {
					state.addTab({ id: crypto.randomUUID(), panes: [pane] });
				}
				return;
			}

			const prior = findPriorRunPanes(state, priorRunTerminalIds);
			if (!prior) {
				state.addTab({ id: crypto.randomUUID(), panes });
				return;
			}

			let lastPaneId =
				prior.paneIds[prior.paneIds.length - 1] ?? prior.paneIds[0];
			panes.forEach((pane, index) => {
				const reusedPaneId = prior.paneIds[index];
				if (reusedPaneId) {
					state.setPaneData({ paneId: reusedPaneId, data: pane.data });
					return;
				}
				state.addPane({
					tabId: prior.tabId,
					pane,
					relativeToPaneId: lastPaneId,
				});
				lastPaneId = pane.id;
			});
			state.setActivePane({ tabId: prior.tabId, paneId: prior.paneIds[0] });
			state.setActiveTab(prior.tabId);
		} catch (error) {
			toast.error(
				t({
					message: "Failed to run workspace command",
				}),
				{
					description: errorMessage(
						error,
						t({
							message: "Unknown error",
						}),
					),
				},
			);
		} finally {
			isStartingRef.current = false;
			setIsPending(false);
		}
	}, [
		definition,
		launcher,
		store,
		t,
		updateWorkspaceRunTerminals,
		workspaceId,
		workspaceRunTerminals,
	]);

	const stopTerminal = useCallback(
		async (terminalId: string) => {
			const stopRequestedAt = Date.now();
			try {
				await writeInputMutation.mutateAsync({
					terminalId,
					workspaceId,
					data: CTRL_C_INPUT,
				});
				const stoppedAt = Date.now();
				updateWorkspaceRunTerminals((states) => {
					const state = states[terminalId];
					if (!state || state.state !== "running") return;
					state.stopRequestedAt = stopRequestedAt;
					markStopped(state, stoppedAt, { state: "stopped-by-user" });
				});
			} catch (error) {
				if (isTerminalGoneError(error)) {
					const stoppedAt = Date.now();
					updateWorkspaceRunTerminals((states) => {
						const state = states[terminalId];
						if (!state || state.state !== "running") return;
						markStopped(state, stoppedAt);
					});
					return;
				}
				updateWorkspaceRunTerminals((states) => {
					const state = states[terminalId];
					if (!state || state.state !== "running") return;
					delete state.stopRequestedAt;
				});
				throw error;
			}
		},
		[updateWorkspaceRunTerminals, workspaceId, writeInputMutation],
	);

	const stopWorkspaceRun = useCallback(async () => {
		if (runningStates.length === 0) return;
		setIsPending(true);
		try {
			const results = await Promise.allSettled(
				runningStates.map((state) => stopTerminal(state.terminalId)),
			);
			const failure = results.find(
				(result): result is PromiseRejectedResult =>
					result.status === "rejected",
			);
			if (failure) {
				toast.error(
					t({
						message: "Failed to stop workspace run command",
					}),
					{
						description: errorMessage(
							failure.reason,
							t({
								message: "Unknown error",
							}),
						),
					},
				);
			}
		} finally {
			setIsPending(false);
		}
	}, [runningStates, stopTerminal, t]);

	const killTerminal = useCallback(
		async (terminalId: string) => {
			try {
				await killSessionMutation.mutateAsync({ terminalId, workspaceId });
				const stoppedAt = Date.now();
				updateWorkspaceRunTerminals((states) => {
					const state = states[terminalId];
					if (!state) return;
					state.stopRequestedAt ??= stoppedAt;
					markStopped(state, stoppedAt, { state: "stopped-by-user" });
				});
			} catch (error) {
				if (isTerminalGoneError(error)) {
					const stoppedAt = Date.now();
					updateWorkspaceRunTerminals((states) => {
						const state = states[terminalId];
						if (!state || state.state !== "running") return;
						markStopped(state, stoppedAt);
					});
					return;
				}
				throw error;
			}
		},
		[killSessionMutation, updateWorkspaceRunTerminals, workspaceId],
	);

	const forceStopWorkspaceRun = useCallback(async () => {
		if (runningStates.length === 0) return;
		setIsPending(true);
		try {
			const results = await Promise.allSettled(
				runningStates.map((state) => killTerminal(state.terminalId)),
			);
			await utils.terminal.list.invalidate({ workspaceId });
			const failure = results.find(
				(result): result is PromiseRejectedResult =>
					result.status === "rejected",
			);
			if (failure) {
				toast.error(
					t({
						message: "Failed to force stop workspace run command",
					}),
					{
						description: errorMessage(
							failure.reason,
							t({
								message: "Unknown error",
							}),
						),
					},
				);
			}
		} finally {
			setIsPending(false);
		}
	}, [killTerminal, runningStates, t, utils, workspaceId]);

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

import type { SelectV2Workspace } from "@superset/db/schema";
import type {
	CreatePaneInput,
	WorkspaceState,
	WorkspaceStore,
} from "@superset/panes";
import { useEffect, useRef } from "react";
import {
	type TerminalRuntimeStressDebugInfo,
	type TerminalWebglContextLossResult,
	terminalRuntimeRegistry,
} from "renderer/lib/terminal/terminal-runtime-registry";
import type { StoreApi } from "zustand/vanilla";
import type {
	BrowserPaneData,
	ChatPaneData,
	CommentPaneData,
	DiffPaneData,
	FilePaneData,
	PaneViewerData,
	TerminalPaneData,
} from "../../types";

type RendererStressPaneKind = "browser" | "chat" | "comment" | "diff" | "file";
type RendererStressTabKind = RendererStressPaneKind | "terminal";

interface RendererStressSummary {
	workspaceId: string;
	projectId: string;
	activeTabId: string | null;
	tabCount: number;
	paneCount: number;
	paneKindCounts: Record<string, number>;
	filePathCount: number;
}

interface RendererStressTerminalSummary extends RendererStressSummary {
	stressTerminalIdCount: number;
	terminalRuntimeCount: number;
	terminalRuntimes: TerminalRuntimeStressDebugInfo[];
}

interface RendererStressTerminalWriteResult {
	terminalCount: number;
	writtenCount: number;
	failedCount: number;
	byteLength: number;
}

interface RendererStressWorkspaceBridge {
	workspaceId: string;
	projectId: string;
	captureBaseline: () => void;
	restoreBaseline: () => void;
	getSummary: () => RendererStressSummary;
	addTab: (
		kind: RendererStressTabKind,
		index: number,
		paneCount?: number,
	) => void;
	openPane: (kind: RendererStressPaneKind, index: number) => void;
	splitActivePane: (kind: RendererStressPaneKind, index: number) => void;
	switchTab: (index: number) => void;
	closeActivePane: () => void;
	closeOldestTab: (keepCount?: number) => void;
	churnActivePaneData: (index: number) => void;
	replaceWithGeneratedLayout: (tabCount: number, panesPerTab: number) => void;
	replaceWithGeneratedTerminalLayout: (
		tabCount: number,
		panesPerTab: number,
	) => void;
	writeTerminalStressOutput: (
		index: number,
		lines: number,
		payloadBytes: number,
	) => Promise<RendererStressTerminalWriteResult>;
	forceTerminalWebglContextLoss: () => TerminalWebglContextLossResult;
	getTerminalStressSummary: () => RendererStressTerminalSummary;
	releaseStressTerminalRuntimes: () => void;
	addRealTerminalTab: () => Promise<void>;
	showChangesSidebar: () => void;
}

declare global {
	interface Window {
		__SUPERSET_RENDERER_STRESS__?: RendererStressWorkspaceBridge;
	}
}

const FALLBACK_FILE_ROOT = "/tmp/superset-renderer-stress";

function cloneWorkspaceState(
	state: WorkspaceState<PaneViewerData>,
): WorkspaceState<PaneViewerData> {
	return JSON.parse(JSON.stringify(state)) as WorkspaceState<PaneViewerData>;
}

function getStoreStateSnapshot(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
): WorkspaceState<PaneViewerData> {
	const state = store.getState();
	return cloneWorkspaceState({
		version: state.version,
		tabs: state.tabs,
		activeTabId: state.activeTabId,
	});
}

function getFilePath(
	filePaths: string[],
	index: number,
	worktreePath?: string | null,
): string {
	if (filePaths.length > 0) {
		return filePaths[index % filePaths.length];
	}
	if (worktreePath) {
		const moduleId = String(index % 20).padStart(2, "0");
		const fileId = String(index % 200).padStart(3, "0");
		return `${worktreePath}/src/module-${moduleId}/file-${fileId}.ts`;
	}
	return `${FALLBACK_FILE_ROOT}/fixture-${index % 25}.tsx`;
}

function createStressTerminalId(workspaceId: string, index: number): string {
	return `renderer-stress-terminal-${workspaceId}-${index}`;
}

function createStressTerminalPane(
	workspaceId: string,
	index: number,
	stressTerminalIds: Set<string>,
): CreatePaneInput<PaneViewerData> {
	const terminalId = createStressTerminalId(workspaceId, index);
	stressTerminalIds.add(terminalId);
	return {
		kind: "terminal",
		data: {
			terminalId,
		} satisfies TerminalPaneData,
	};
}

function createStressPane(
	kind: RendererStressPaneKind,
	index: number,
	filePaths: string[],
	worktreePath?: string | null,
): CreatePaneInput<PaneViewerData> {
	const filePath = getFilePath(filePaths, index, worktreePath);
	switch (kind) {
		case "browser":
			return {
				kind,
				data: {
					url: index % 3 === 0 ? "about:blank" : "https://example.com/",
				} satisfies BrowserPaneData,
			};
		case "chat":
			return {
				kind,
				data: {
					sessionId: null,
					launchConfig:
						index % 2 === 0
							? { initialPrompt: `renderer stress prompt ${index}` }
							: null,
				} satisfies ChatPaneData,
			};
		case "comment":
			return {
				kind,
				data: {
					commentId: `renderer-stress-comment-${index}`,
					authorLogin: "renderer-stress",
					body: `Renderer stress comment ${index}`,
					path: filePath,
					line: (index % 200) + 1,
				} satisfies CommentPaneData,
			};
		case "diff":
			return {
				kind,
				data: {
					path: filePath,
					collapsedFiles: index % 2 === 0 ? [] : [filePath],
					expandedFiles: [filePath],
					focusLine: (index % 200) + 1,
					focusTick: Date.now(),
				} satisfies DiffPaneData,
			};
		case "file":
			return {
				kind,
				data: {
					filePath,
					mode: index % 3 === 0 ? "preview" : "editor",
				} satisfies FilePaneData,
			};
	}
}

function getNextPaneKind(index: number): RendererStressPaneKind {
	const kinds: RendererStressPaneKind[] = [
		"file",
		"diff",
		"browser",
		"chat",
		"comment",
	];
	return kinds[index % kinds.length];
}

function isRendererStressPaneKind(
	kind: string,
): kind is RendererStressPaneKind {
	return (
		kind === "browser" ||
		kind === "chat" ||
		kind === "comment" ||
		kind === "diff" ||
		kind === "file"
	);
}

function collectStressTerminalRefs(
	state: WorkspaceState<PaneViewerData>,
	stressTerminalIds: Set<string>,
): Array<{ terminalId: string; instanceId: string }> {
	const refs: Array<{ terminalId: string; instanceId: string }> = [];
	for (const tab of state.tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.kind !== "terminal") continue;
			const terminalId = (pane.data as TerminalPaneData).terminalId;
			if (!stressTerminalIds.has(terminalId)) continue;
			refs.push({ terminalId, instanceId: pane.id });
		}
	}
	return refs;
}

function makeTerminalStressOutput(
	index: number,
	lines: number,
	payloadBytes: number,
): string {
	const boundedLines = Math.max(1, Math.min(500, Math.floor(lines)));
	const boundedPayloadBytes = Math.max(
		0,
		Math.min(4096, Math.floor(payloadBytes)),
	);
	const seed = `terminal-stress-${index}-`;
	const payload =
		boundedPayloadBytes > 0
			? seed
					.repeat(Math.ceil(boundedPayloadBytes / seed.length))
					.slice(0, boundedPayloadBytes)
			: "";
	const chunks: string[] = [];

	for (let line = 0; line < boundedLines; line += 1) {
		const color = (index + line) % 256;
		const red = (index * 17 + line * 3) % 256;
		const green = (index * 29 + line * 5) % 256;
		const blue = (index * 31 + line * 7) % 256;
		if (line % 25 === 0) {
			chunks.push(`\x1b]0;renderer terminal stress ${index}.${line}\x07`);
		}
		chunks.push(
			`\x1b[38;2;${red};${green};${blue}m\x1b[48;5;${color}m` +
				`[${String(index).padStart(4, "0")}:${String(line).padStart(4, "0")}] ` +
				`${payload}\x1b[0m\r\n`,
		);
	}

	return chunks.join("");
}

function getSummary(
	workspace: SelectV2Workspace,
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	filePaths: string[],
): RendererStressSummary {
	const state = store.getState();
	const paneKindCounts: Record<string, number> = {};
	let paneCount = 0;
	for (const tab of state.tabs) {
		for (const pane of Object.values(tab.panes)) {
			paneCount += 1;
			paneKindCounts[pane.kind] = (paneKindCounts[pane.kind] ?? 0) + 1;
		}
	}
	return {
		workspaceId: workspace.id,
		projectId: workspace.projectId,
		activeTabId: state.activeTabId,
		tabCount: state.tabs.length,
		paneCount,
		paneKindCounts,
		filePathCount: filePaths.length,
	};
}

export function useRendererStressWorkspaceBridge({
	workspace,
	store,
	filePaths,
	worktreePath,
	addTerminalTab,
	showChangesSidebar,
}: {
	workspace: SelectV2Workspace;
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	filePaths: string[];
	worktreePath?: string | null;
	addTerminalTab: () => Promise<void>;
	showChangesSidebar: () => void;
}) {
	const baselineRef = useRef<WorkspaceState<PaneViewerData> | null>(null);
	const stressTerminalIdsRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		if (process.env.NODE_ENV !== "development") return;

		const getBridgeSummary = () => getSummary(workspace, store, filePaths);
		const releaseStressTerminalRuntimes = () => {
			for (const terminalId of stressTerminalIdsRef.current) {
				terminalRuntimeRegistry.release(terminalId);
			}
			stressTerminalIdsRef.current.clear();
		};
		const getStressTerminalRefs = () =>
			collectStressTerminalRefs(store.getState(), stressTerminalIdsRef.current);
		const bridge: RendererStressWorkspaceBridge = {
			workspaceId: workspace.id,
			projectId: workspace.projectId,
			captureBaseline: () => {
				baselineRef.current = getStoreStateSnapshot(store);
			},
			restoreBaseline: () => {
				releaseStressTerminalRuntimes();
				const baseline = baselineRef.current;
				if (!baseline) return;
				store.getState().replaceState(cloneWorkspaceState(baseline));
			},
			getSummary: getBridgeSummary,
			addTab: (kind, index, paneCount = 1) => {
				if (kind === "terminal") {
					void addTerminalTab();
					return;
				}
				const count = Math.max(1, Math.min(8, Math.floor(paneCount)));
				store.getState().addTab({
					panes: Array.from({ length: count }, (_, offset) =>
						createStressPane(
							offset === 0 ? kind : getNextPaneKind(index + offset),
							index + offset,
							filePaths,
							worktreePath,
						),
					) as [
						CreatePaneInput<PaneViewerData>,
						...CreatePaneInput<PaneViewerData>[],
					],
				});
			},
			openPane: (kind, index) => {
				store.getState().openPane({
					pane: createStressPane(kind, index, filePaths, worktreePath),
				});
			},
			splitActivePane: (kind, index) => {
				const state = store.getState();
				const active = state.getActivePane();
				if (!active) {
					bridge.addTab(kind, index);
					return;
				}
				state.splitPane({
					tabId: active.tabId,
					paneId: active.pane.id,
					position: index % 2 === 0 ? "right" : "bottom",
					newPane: createStressPane(kind, index, filePaths, worktreePath),
				});
			},
			switchTab: (index) => {
				const state = store.getState();
				if (state.tabs.length === 0) return;
				state.setActiveTab(state.tabs[index % state.tabs.length].id);
			},
			closeActivePane: () => {
				const state = store.getState();
				const active = state.getActivePane();
				if (!active) return;
				state.closePane({ tabId: active.tabId, paneId: active.pane.id });
			},
			closeOldestTab: (keepCount = 4) => {
				const state = store.getState();
				if (state.tabs.length <= keepCount) return;
				state.removeTab(state.tabs[0].id);
			},
			churnActivePaneData: (index) => {
				const state = store.getState();
				const active = state.getActivePane();
				if (!active) {
					bridge.addTab("file", index);
					return;
				}
				const nextKind = isRendererStressPaneKind(active.pane.kind)
					? active.pane.kind
					: "file";
				state.setPaneData({
					paneId: active.pane.id,
					data: createStressPane(nextKind, index, filePaths, worktreePath).data,
				});
			},
			replaceWithGeneratedLayout: (tabCount, panesPerTab) => {
				releaseStressTerminalRuntimes();
				store.getState().replaceState({
					version: 1,
					tabs: [],
					activeTabId: null,
				});
				const boundedTabCount = Math.max(1, Math.min(50, Math.floor(tabCount)));
				const boundedPaneCount = Math.max(
					1,
					Math.min(8, Math.floor(panesPerTab)),
				);
				for (let tabIndex = 0; tabIndex < boundedTabCount; tabIndex += 1) {
					bridge.addTab(
						getNextPaneKind(tabIndex),
						tabIndex * 10,
						boundedPaneCount,
					);
				}
			},
			replaceWithGeneratedTerminalLayout: (tabCount, panesPerTab) => {
				releaseStressTerminalRuntimes();
				store.getState().replaceState({
					version: 1,
					tabs: [],
					activeTabId: null,
				});
				const boundedTabCount = Math.max(1, Math.min(80, Math.floor(tabCount)));
				const boundedPaneCount = Math.max(
					1,
					Math.min(8, Math.floor(panesPerTab)),
				);
				for (let tabIndex = 0; tabIndex < boundedTabCount; tabIndex += 1) {
					const panes = Array.from({ length: boundedPaneCount }, (_, offset) =>
						createStressTerminalPane(
							workspace.id,
							tabIndex * boundedPaneCount + offset,
							stressTerminalIdsRef.current,
						),
					) as [
						CreatePaneInput<PaneViewerData>,
						...CreatePaneInput<PaneViewerData>[],
					];
					store.getState().addTab({ panes });
				}
			},
			writeTerminalStressOutput: async (index, lines, payloadBytes) => {
				const refs = getStressTerminalRefs();
				const output = makeTerminalStressOutput(index, lines, payloadBytes);
				const results = await Promise.all(
					refs.map((ref) =>
						terminalRuntimeRegistry.writeForStress(
							ref.terminalId,
							output,
							ref.instanceId,
						),
					),
				);
				const writtenCount = results.filter(Boolean).length;
				return {
					terminalCount: refs.length,
					writtenCount,
					failedCount: refs.length - writtenCount,
					byteLength: output.length,
				};
			},
			forceTerminalWebglContextLoss: () => {
				const result: TerminalWebglContextLossResult = {
					terminalCount: 0,
					canvasCount: 0,
					webglContextCount: 0,
					lostContextCount: 0,
					unsupportedContextCount: 0,
				};
				for (const ref of getStressTerminalRefs()) {
					const partial =
						terminalRuntimeRegistry.forceWebglContextLossForStress(
							ref.terminalId,
							ref.instanceId,
						);
					result.terminalCount += partial.terminalCount;
					result.canvasCount += partial.canvasCount;
					result.webglContextCount += partial.webglContextCount;
					result.lostContextCount += partial.lostContextCount;
					result.unsupportedContextCount += partial.unsupportedContextCount;
				}
				return result;
			},
			getTerminalStressSummary: () => {
				const stressTerminalIds = stressTerminalIdsRef.current;
				const terminalRuntimes = terminalRuntimeRegistry
					.getStressDebugInfo()
					.filter((runtime) => stressTerminalIds.has(runtime.terminalId));
				return {
					...getBridgeSummary(),
					stressTerminalIdCount: stressTerminalIds.size,
					terminalRuntimeCount: terminalRuntimes.length,
					terminalRuntimes,
				};
			},
			releaseStressTerminalRuntimes,
			addRealTerminalTab: addTerminalTab,
			showChangesSidebar,
		};

		window.__SUPERSET_RENDERER_STRESS__ = bridge;
		return () => {
			if (window.__SUPERSET_RENDERER_STRESS__ === bridge) {
				delete window.__SUPERSET_RENDERER_STRESS__;
			}
			releaseStressTerminalRuntimes();
		};
	}, [
		addTerminalTab,
		filePaths,
		showChangesSidebar,
		store,
		workspace,
		worktreePath,
	]);
}

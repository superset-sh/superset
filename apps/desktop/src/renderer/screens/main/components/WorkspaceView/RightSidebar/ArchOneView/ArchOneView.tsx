import { useParams } from "@tanstack/react-router";
import { useCallback } from "react";
import { LuPlay, LuRadar, LuRefreshCw, LuUnplug } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import { EnvSyncSection } from "./components/EnvSyncSection";
import { GitStatusSection } from "./components/GitStatusSection";
import { GreptileSection } from "./components/GreptileSection";
import { SeedSection } from "./components/SeedSection";
import { ServicesSection } from "./components/ServicesSection";
import { SlotManagerSection } from "./components/SlotManagerSection";
import { TestResultsSection } from "./components/TestResultsSection";
import { useEnvSync } from "./hooks/useEnvSync";
import { useGitStatus } from "./hooks/useGitStatus";
import { useFixStatus, useGreptileScore } from "./hooks/useGreptileScore";
import { useSeededUsers } from "./hooks/useSeededUsers";
import { useServiceHealth } from "./hooks/useServiceHealth";
import { useTestResults } from "./hooks/useTestResults";

export type FixPhase =
	| "idle"
	| "fixing"
	| "waiting-for-review"
	| "done"
	| "max-reached"
	| "stopped";

export interface FixLoopState {
	phase: FixPhase;
	iteration: number;
	lastTriggeredScore: number | null;
}

export function ArchOneView() {
	const { workspaceId } = useParams({ strict: false });
	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId ?? "" },
		{ enabled: !!workspaceId },
	);
	const worktreePath = workspace?.worktreePath;

	const gitStatus = useGitStatus(worktreePath);
	const serviceHealth = useServiceHealth(worktreePath);
	const testResults = useTestResults(worktreePath);
	const envSync = useEnvSync(worktreePath);
	const seededUsers = useSeededUsers(worktreePath);

	// Fix loop state lives on the backend — just read it
	const fixStatus = useFixStatus(worktreePath);
	const fixLoop: FixLoopState = fixStatus.data ?? {
		phase: "idle",
		iteration: 0,
		lastTriggeredScore: null,
	};
	const maxIterations = fixStatus.data?.maxIterations ?? 10;

	// Poll greptile faster during active fix loop (for UI display)
	const isFixActive =
		fixLoop.phase === "fixing" || fixLoop.phase === "waiting-for-review";
	const greptilePollInterval = isFixActive ? 15_000 : 30_000;
	const greptile = useGreptileScore(worktreePath, greptilePollInterval);

	const fixGreptile = electronTrpc.archOne.fixGreptile.useMutation();
	const stopFix = electronTrpc.archOne.stopFix.useMutation();

	const handleFixGreptile = useCallback(() => {
		if (!worktreePath) return;
		fixGreptile.mutate({
			worktreePath,
			reviewContent: greptile.data?.reviewContent ?? undefined,
			prNumber: greptile.data?.prNumber ?? undefined,
		});
	}, [
		worktreePath,
		fixGreptile,
		greptile.data?.reviewContent,
		greptile.data?.prNumber,
	]);

	const handleStopFix = useCallback(() => {
		if (!worktreePath) return;
		stopFix.mutate({ worktreePath });
	}, [worktreePath, stopFix]);

	// Terminal spawn helpers
	const addPane = useTabsStore((s) => s.addPane);
	const tabs = useTabsStore((s) => s.tabs);
	const terminalWrite = electronTrpc.terminal.write.useMutation();
	const spawnCommand = useCallback(
		(command: string) => {
			if (!workspaceId) return;
			const currentTab = tabs.find((t) => t.workspaceId === workspaceId);
			if (!currentTab) return;

			const paneId = addPane(currentTab.id);
			if (paneId) {
				setTimeout(() => {
					terminalWrite.mutate({ paneId, data: `${command}\r` });
				}, 500);
			}
		},
		[workspaceId, tabs, addPane, terminalWrite],
	);

	const handleRerunTests = useCallback(() => {
		spawnCommand("npm run test:fast");
	}, [spawnCommand]);

	const handleRestartService = useCallback(
		(restartCommand: string) => {
			spawnCommand(restartCommand);
		},
		[spawnCommand],
	);

	const handleEnvSync = useCallback(() => {
		if (!workspaceId) return;
		const currentTab = tabs.find((t) => t.workspaceId === workspaceId);
		if (!currentTab) return;

		const paneId = addPane(currentTab.id);
		if (paneId) {
			setTimeout(() => {
				terminalWrite.mutate({
					paneId,
					data: "npm run dev:sync\r",
				});
			}, 500);
		}
	}, [workspaceId, tabs, addPane, terminalWrite]);

	if (!worktreePath) {
		return (
			<div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-4">
				<LuRadar className="size-8 mb-2 opacity-50" />
				<span>Select a workspace</span>
			</div>
		);
	}

	return (
		<div className="flex flex-col overflow-y-auto h-full">
			<div className="flex items-center gap-2 px-3 py-2 border-b border-border">
				<LuRadar className="size-4 text-primary" />
				<span className="text-sm font-semibold">Alike GUI</span>
				<div className="ml-auto flex items-center gap-1">
					<button
						type="button"
						title="Full Stack Dev"
						onClick={() => spawnCommand("npm run dev")}
						className="p-1 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
					>
						<LuPlay className="size-3.5" />
					</button>
					<button
						type="button"
						title="Dev Detached"
						onClick={() => spawnCommand("npm run dev:detached")}
						className="p-1 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
					>
						<LuUnplug className="size-3.5" />
					</button>
					<button
						type="button"
						title="Reset DB"
						onClick={() => spawnCommand("npm run dev:resetdb")}
						className="p-1 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
					>
						<LuRefreshCw className="size-3.5" />
					</button>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto">
				<SlotManagerSection
					worktreePath={worktreePath}
					onSpawnCommand={spawnCommand}
				/>
				<GitStatusSection
					data={gitStatus.data}
					isLoading={gitStatus.isLoading}
				/>
				<GreptileSection
					data={greptile.data}
					isLoading={greptile.isLoading}
					onRefresh={greptile.refetch}
					onFixGreptile={handleFixGreptile}
					onStopFix={handleStopFix}
					fixLoop={fixLoop}
					maxIterations={maxIterations}
				/>
				<ServicesSection
					data={serviceHealth.data}
					isLoading={serviceHealth.isLoading}
					onRestart={handleRestartService}
				/>
				<EnvSyncSection
					data={envSync.data}
					isLoading={envSync.isLoading}
					onSync={handleEnvSync}
				/>
				<TestResultsSection
					data={testResults.data}
					isLoading={testResults.isLoading}
					onRerun={handleRerunTests}
				/>
				<SeedSection
					onRunSeed={spawnCommand}
					seededUsers={seededUsers.data}
					isLoadingUsers={seededUsers.isLoading}
					onRefreshUsers={seededUsers.refetch}
				/>
			</div>
		</div>
	);
}

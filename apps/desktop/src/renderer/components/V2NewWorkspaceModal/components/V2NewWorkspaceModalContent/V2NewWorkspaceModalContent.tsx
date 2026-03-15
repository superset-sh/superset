import { Command, CommandInput, CommandList } from "@superset/ui/command";
import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	useV2NewWorkspaceModalDraft,
	type V2NewWorkspaceModalTab,
} from "../../V2NewWorkspaceModalDraftContext";
import { DevicePicker } from "../DevicePicker";
import { V2BranchesGroup } from "../V2BranchesGroup";
import { V2IssuesGroup } from "../V2IssuesGroup";
import { V2ProjectSelector } from "../V2ProjectSelector";
import { V2PromptGroup } from "../V2PromptGroup";
import { V2PullRequestsGroup } from "../V2PullRequestsGroup";

const COMMAND_CLASS_NAME =
	"[&_[cmdk-group-heading]]:text-muted-foreground **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5 flex h-full w-full flex-1 flex-col overflow-hidden rounded-none";

interface V2NewWorkspaceModalContentProps {
	isOpen: boolean;
	preSelectedProjectId: string | null;
}

/** V2 content pane for the New Workspace modal with collection-based project selection. */
export function V2NewWorkspaceModalContent({
	isOpen,
	preSelectedProjectId,
}: V2NewWorkspaceModalContentProps) {
	const { draft, updateDraft } = useV2NewWorkspaceModalDraft();
	const collections = useCollections();

	// Get all v2 projects
	const { data: v2ProjectsData } = useLiveQuery(
		(q) =>
			q
				.from({ projects: collections.v2Projects })
				.select(({ projects }) => ({ ...projects })),
		[collections],
	);
	const v2Projects = useMemo(() => v2ProjectsData ?? [], [v2ProjectsData]);
	const areV2ProjectsReady = v2ProjectsData !== undefined;

	const appliedPreSelectionRef = useRef<string | null>(null);

	useEffect(() => {
		if (!isOpen) {
			appliedPreSelectionRef.current = null;
		}
	}, [isOpen]);

	// Auto-select first v2 project when modal opens
	useEffect(() => {
		if (!isOpen) return;

		// Only use preSelectedProjectId if it matches an actual v2 project
		if (
			preSelectedProjectId &&
			preSelectedProjectId !== appliedPreSelectionRef.current
		) {
			if (!areV2ProjectsReady) return;
			const hasPreSelectedProject = v2Projects.some(
				(project) => project.id === preSelectedProjectId,
			);
			if (hasPreSelectedProject) {
				appliedPreSelectionRef.current = preSelectedProjectId;
				if (preSelectedProjectId !== draft.selectedProjectId) {
					updateDraft({ selectedProjectId: preSelectedProjectId });
				}
				return;
			}
		}

		if (!areV2ProjectsReady) return;

		const hasSelectedProject = v2Projects.some(
			(project) => project.id === draft.selectedProjectId,
		);
		if (!hasSelectedProject) {
			updateDraft({ selectedProjectId: v2Projects[0]?.id ?? null });
		}
	}, [
		draft.selectedProjectId,
		areV2ProjectsReady,
		isOpen,
		preSelectedProjectId,
		v2Projects,
		updateDraft,
	]);

	// Find selected v2 project
	const selectedV2Project = v2Projects.find(
		(p) => p.id === draft.selectedProjectId,
	);

	const githubRepositoryId = selectedV2Project?.githubRepositoryId ?? null;

	// Look up github repo details from Electric collection
	const { data: githubRepoData } = useLiveQuery(
		(q) =>
			q
				.from({ repos: collections.githubRepositories })
				.where(({ repos }) => eq(repos.id, githubRepositoryId ?? ""))
				.select(({ repos }) => ({
					id: repos.id,
					owner: repos.owner,
					name: repos.name,
				})),
		[collections, githubRepositoryId],
	);
	const githubRepo = githubRepoData?.[0] ?? null;

	// Get all local projects to resolve v2 project -> local project
	const { data: localProjects = [] } =
		electronTrpc.projects.getRecents.useQuery();

	// Resolve: match local project by github owner + repo name (or directory basename)
	const resolvedLocalProjectId = useMemo(() => {
		if (!githubRepo) return null;
		const match = localProjects.find((lp) => {
			if (lp.githubOwner !== githubRepo.owner) return false;
			if (lp.name === githubRepo.name) return true;
			// Fallback: check directory basename in case user renamed the project
			const dirName = lp.mainRepoPath?.split("/").pop();
			return dirName === githubRepo.name;
		});
		return match?.id ?? null;
	}, [githubRepo, localProjects]);

	const isListTab = draft.activeTab !== "prompt";
	const listQuery =
		draft.activeTab === "issues"
			? draft.issuesQuery
			: draft.activeTab === "branches"
				? draft.branchesQuery
				: draft.pullRequestsQuery;

	const handleListQueryChange = (value: string) => {
		switch (draft.activeTab) {
			case "issues":
				updateDraft({ issuesQuery: value });
				return;
			case "branches":
				updateDraft({ branchesQuery: value });
				return;
			case "pull-requests":
				updateDraft({ pullRequestsQuery: value });
				return;
			default:
				return;
		}
	};

	return (
		<>
			<div className="flex items-center justify-between border-b px-4 py-2.5">
				<Tabs
					value={draft.activeTab}
					onValueChange={(value) =>
						updateDraft({ activeTab: value as V2NewWorkspaceModalTab })
					}
				>
					<TabsList>
						<TabsTrigger value="prompt">Prompt</TabsTrigger>
						<TabsTrigger value="issues">Issues</TabsTrigger>
						<TabsTrigger value="pull-requests">Pull requests</TabsTrigger>
						<TabsTrigger value="branches">Branches</TabsTrigger>
					</TabsList>
				</Tabs>
				<div className="flex items-center gap-1">
					<DevicePicker
						selectedDeviceId={draft.selectedDeviceId}
						onSelectDevice={(selectedDeviceId) =>
							updateDraft({ selectedDeviceId })
						}
					/>
					<div className="mx-0.5 h-4 w-px bg-border" />
					<V2ProjectSelector
						selectedProjectId={draft.selectedProjectId}
						onSelectProject={(selectedProjectId) =>
							updateDraft({ selectedProjectId })
						}
					/>
				</div>
			</div>

			{isListTab ? (
				<Command shouldFilter={false} className={COMMAND_CLASS_NAME}>
					<CommandInput
						value={listQuery}
						onValueChange={handleListQueryChange}
						placeholder={
							draft.activeTab === "issues"
								? "Search by slug, title, or description"
								: draft.activeTab === "branches"
									? "Search by name"
									: "Search by title, number, or author"
						}
					/>

					<CommandList className="!max-h-none flex-1 overflow-y-auto">
						{draft.activeTab === "pull-requests" && (
							<V2PullRequestsGroup
								projectId={draft.selectedProjectId}
								githubRepositoryId={githubRepositoryId}
								selectedDeviceId={draft.selectedDeviceId}
							/>
						)}
						{draft.activeTab === "branches" && (
							<V2BranchesGroup
								projectId={draft.selectedProjectId}
								localProjectId={resolvedLocalProjectId}
								selectedDeviceId={draft.selectedDeviceId}
							/>
						)}
						{draft.activeTab === "issues" && (
							<V2IssuesGroup
								projectId={draft.selectedProjectId}
								selectedDeviceId={draft.selectedDeviceId}
							/>
						)}
					</CommandList>
				</Command>
			) : (
				<div className="flex-1 overflow-y-auto">
					<V2PromptGroup
						projectId={draft.selectedProjectId}
						localProjectId={resolvedLocalProjectId}
						selectedDeviceId={draft.selectedDeviceId}
					/>
				</div>
			)}
		</>
	);
}

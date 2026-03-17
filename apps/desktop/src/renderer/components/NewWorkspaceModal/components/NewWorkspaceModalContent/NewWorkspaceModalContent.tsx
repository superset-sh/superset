import { Command, CommandInput, CommandList } from "@superset/ui/command";
import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { useEffect } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	type NewWorkspaceModalTab,
	useNewWorkspaceModalDraft,
} from "../../NewWorkspaceModalDraftContext";
import { BranchesGroup } from "../BranchesGroup";
import { IssuesGroup } from "../IssuesGroup";
import { ProjectSelector } from "../ProjectSelector";
import { PromptGroup } from "../PromptGroup";
import { PullRequestsGroup } from "../PullRequestsGroup";

const COMMAND_CLASS_NAME =
	"[&_[cmdk-group-heading]]:text-muted-foreground **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5 flex h-full w-full flex-1 flex-col overflow-hidden rounded-none";

interface NewWorkspaceModalContentProps {
	isOpen: boolean;
	preSelectedProjectId: string | null;
	onImportRepo: () => Promise<void>;
	onNewProject: () => void;
}

export function NewWorkspaceModalContent({
	isOpen,
	preSelectedProjectId,
	onImportRepo,
	onNewProject,
}: NewWorkspaceModalContentProps) {
	const { draft, updateDraft } = useNewWorkspaceModalDraft();
	const { data: recentProjects = [] } =
		electronTrpc.projects.getRecents.useQuery();
	const utils = electronTrpc.useUtils();

	// Refetch branches (and other data) when the modal opens to avoid stale data
	useEffect(() => {
		if (!isOpen) return;
		void utils.projects.getBranches.invalidate();
		void utils.projects.getBranchesLocal.invalidate();
	}, [isOpen, utils]);

	useEffect(() => {
		if (!isOpen) return;

		if (
			preSelectedProjectId &&
			preSelectedProjectId !== draft.selectedProjectId
		) {
			updateDraft({ selectedProjectId: preSelectedProjectId });
			return;
		}

		const hasSelectedProject = recentProjects.some(
			(project) => project.id === draft.selectedProjectId,
		);
		if (!hasSelectedProject) {
			updateDraft({ selectedProjectId: recentProjects[0]?.id ?? null });
		}
	}, [
		draft.selectedProjectId,
		isOpen,
		preSelectedProjectId,
		recentProjects,
		updateDraft,
	]);

	const selectedProject = recentProjects.find(
		(project) => project.id === draft.selectedProjectId,
	);
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
			<div className="flex items-center justify-between border-b px-3 py-2">
				<Tabs
					value={draft.activeTab}
					onValueChange={(value) =>
						updateDraft({ activeTab: value as NewWorkspaceModalTab })
					}
				>
					<TabsList>
						<TabsTrigger value="prompt">Prompt</TabsTrigger>
						<TabsTrigger value="issues">Issues</TabsTrigger>
						<TabsTrigger value="pull-requests">Pull requests</TabsTrigger>
						<TabsTrigger value="branches">Branches</TabsTrigger>
					</TabsList>
				</Tabs>
				<ProjectSelector
					selectedProjectId={draft.selectedProjectId}
					selectedProjectName={selectedProject?.name ?? null}
					recentProjects={recentProjects.filter((project) =>
						Boolean(project.id),
					)}
					onSelectProject={(selectedProjectId) =>
						updateDraft({ selectedProjectId })
					}
					onImportRepo={onImportRepo}
					onNewProject={onNewProject}
				/>
			</div>

			{isListTab ? (
				<Command className={COMMAND_CLASS_NAME}>
					<CommandInput
						value={listQuery}
						onValueChange={handleListQueryChange}
						placeholder={
							draft.activeTab === "issues"
								? "Search by slug, title, or description"
								: draft.activeTab === "branches"
									? "Search by name"
									: "Search by title, number, author, or paste a url"
						}
					/>

					<CommandList className="!max-h-none flex-1 overflow-y-auto">
						{draft.activeTab === "pull-requests" && (
							<PullRequestsGroup
								projectId={draft.selectedProjectId}
								githubOwner={selectedProject?.githubOwner ?? null}
								repoName={selectedProject?.name ?? null}
							/>
						)}
						{draft.activeTab === "branches" && (
							<BranchesGroup projectId={draft.selectedProjectId} />
						)}
						{draft.activeTab === "issues" && (
							<IssuesGroup projectId={draft.selectedProjectId} />
						)}
					</CommandList>
				</Command>
			) : (
				<div className="flex-1 overflow-y-auto">
					<PromptGroup projectId={draft.selectedProjectId} />
				</div>
			)}
		</>
	);
}

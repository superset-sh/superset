import { CommandDialog, CommandInput, CommandList } from "@superset/ui/command";
import { toast } from "@superset/ui/sonner";
import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useOpenProject } from "renderer/react-query/projects";
import {
	useCloseNewWorkspaceModal,
	useNewWorkspaceModalOpen,
	usePreSelectedProjectId,
} from "renderer/stores/new-workspace-modal";
import { BranchesGroup } from "./components/BranchesGroup";
import { IssuesGroup } from "./components/IssuesGroup";
import { ProjectSelector } from "./components/ProjectSelector";
import { PromptGroup } from "./components/PromptGroup";
import { PullRequestsGroup } from "./components/PullRequestsGroup";

type Tab = "prompt" | "issues" | "pull-requests" | "branches";

export function NewWorkspaceModal() {
	const isOpen = useNewWorkspaceModalOpen();
	const closeModal = useCloseNewWorkspaceModal();
	const preSelectedProjectId = usePreSelectedProjectId();
	const [activeTab, setActiveTab] = useState<Tab>("prompt");
	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
		null,
	);
	const navigate = useNavigate();
	const { openNew } = useOpenProject();

	const { data: recentProjects = [] } =
		electronTrpc.projects.getRecents.useQuery();

	// Sync pre-selected project when modal opens
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on modal open
	useEffect(() => {
		if (!isOpen) return;
		if (preSelectedProjectId) {
			setSelectedProjectId(preSelectedProjectId);
		} else if (recentProjects.length > 0 && !selectedProjectId) {
			setSelectedProjectId(recentProjects[0].id);
		}
	}, [isOpen]);

	const selectedProject = recentProjects.find(
		(p) => p.id === selectedProjectId,
	);
	const isListTab = activeTab !== "prompt";

	const handleImportRepo = async () => {
		closeModal();
		try {
			await openNew();
		} catch (error) {
			toast.error("Failed to open project", {
				description:
					error instanceof Error ? error.message : "An unknown error occurred",
			});
		}
	};

	const handleNewProject = () => {
		closeModal();
		navigate({ to: "/new-project" });
	};

	return (
		<CommandDialog
			open={isOpen}
			onOpenChange={(open) => !open && closeModal()}
			title="New Workspace"
			description="Create a new workspace from a PR, branch, issue, or prompt."
			showCloseButton={false}
			className="sm:max-w-[560px] max-h-[min(70vh,600px)] !top-[calc(50%-min(35vh,300px))] !-translate-y-0 flex flex-col"
		>
			<div className="flex items-center justify-between border-b px-3 py-2">
				<Tabs
					value={activeTab}
					onValueChange={(value) => setActiveTab(value as Tab)}
				>
					<TabsList>
						<TabsTrigger value="prompt">Prompt</TabsTrigger>
						<TabsTrigger value="issues">Issues</TabsTrigger>
						<TabsTrigger value="pull-requests">Pull requests</TabsTrigger>
						<TabsTrigger value="branches">Branches</TabsTrigger>
					</TabsList>
				</Tabs>
				<ProjectSelector
					selectedProjectId={selectedProjectId}
					selectedProjectName={selectedProject?.name ?? null}
					recentProjects={recentProjects.filter((p) => Boolean(p.id))}
					onSelectProject={setSelectedProjectId}
					onImportRepo={handleImportRepo}
					onNewProject={handleNewProject}
				/>
			</div>

			{isListTab && (
				<CommandInput
					placeholder={
						activeTab === "issues"
							? "Search by slug, title, or description"
							: activeTab === "branches"
								? "Search by name"
								: "Search by title, number, or author"
					}
				/>
			)}

			<CommandList className="!max-h-none flex-1 overflow-y-auto">
				{activeTab === "pull-requests" && (
					<PullRequestsGroup
						projectId={selectedProjectId}
						githubOwner={selectedProject?.githubOwner ?? null}
						repoName={selectedProject?.name ?? null}
						onClose={closeModal}
					/>
				)}
				{activeTab === "branches" && (
					<BranchesGroup projectId={selectedProjectId} onClose={closeModal} />
				)}
				{activeTab === "issues" && (
					<IssuesGroup projectId={selectedProjectId} onClose={closeModal} />
				)}
				{activeTab === "prompt" && (
					<PromptGroup projectId={selectedProjectId} onClose={closeModal} />
				)}
			</CommandList>
		</CommandDialog>
	);
}

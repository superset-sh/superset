"use client";

import {
	type MockModel,
	type MockRepo,
	type MockWorkspace,
	mockBranches,
	mockModels,
	mockRepos,
} from "../../mock-data";
import { PreviewPromptComposer } from "../PreviewPromptComposer";
import { BranchSelector } from "./components/BranchSelector";
import { ModelPicker } from "./components/ModelPicker";
import { RepoSelector } from "./components/RepoSelector";
import { useAgentPrompt } from "./hooks/useAgentPrompt";

type AgentPromptInputProps = {
	branches?: string[];
	models?: MockModel[];
	repos?: MockRepo[];
	workspace: MockWorkspace;
};

export function AgentPromptInput({
	branches = mockBranches,
	models = mockModels,
	repos = mockRepos,
	workspace,
}: AgentPromptInputProps) {
	const {
		selectedModel,
		setSelectedModel,
		selectedRepo,
		setSelectedRepo,
		selectedBranch,
		setSelectedBranch,
	} = useAgentPrompt({
		branches,
		models,
		repos,
		workspace,
	});

	return (
		<PreviewPromptComposer
			containerClassName="flex flex-col overflow-hidden rounded-[13px] border-[0.5px] border-border bg-foreground/[0.02]"
			promptInputClassName="[&>[data-slot=input-group]]:rounded-none [&>[data-slot=input-group]]:border-none [&>[data-slot=input-group]]:shadow-none"
			placeholder="Session creation on web is coming soon"
			footerToolsClassName="gap-1.5"
			footerTools={
				<ModelPicker
					models={models}
					selectedModel={selectedModel}
					onModelChange={setSelectedModel}
					disabled
				/>
			}
			afterComposer={
				<div className="flex items-center gap-2 border-t border-border/50 px-3 py-2">
					<RepoSelector
						repos={repos}
						selectedRepo={selectedRepo}
						onRepoChange={setSelectedRepo}
						disabled
					/>
					<BranchSelector
						branches={branches}
						selectedBranch={selectedBranch}
						onBranchChange={setSelectedBranch}
						disabled
					/>
				</div>
			}
			messageClassName="border-t border-border/50 px-3 py-2 text-xs text-muted-foreground"
		/>
	);
}

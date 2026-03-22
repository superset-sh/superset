"use client";

import {
	PromptInput,
	PromptInputAttachment,
	PromptInputAttachments,
	PromptInputFooter,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputTools,
} from "@superset/ui/ai-elements/prompt-input";
import { ArrowUpIcon } from "lucide-react";
import { MAX_FILE_SIZE, MAX_FILES } from "../../constants";
import { PlusMenu } from "../PlusMenu";
import { BranchSelector } from "./components/BranchSelector";
import { ModelPicker } from "./components/ModelPicker";
import { RepoSelector } from "./components/RepoSelector";
import { useAgentPrompt } from "./hooks/useAgentPrompt";

export function AgentPromptInput() {
	const {
		selectedModel,
		setSelectedModel,
		selectedRepo,
		setSelectedRepo,
		selectedBranch,
		setSelectedBranch,
		handleSubmit,
	} = useAgentPrompt();

	return (
		<div className="flex flex-col overflow-hidden rounded-[13px] border-[0.5px] border-border bg-foreground/[0.02]">
			<PromptInput
				onSubmit={handleSubmit}
				className="[&>[data-slot=input-group]]:rounded-none [&>[data-slot=input-group]]:border-none [&>[data-slot=input-group]]:shadow-none"
				multiple
				maxFiles={MAX_FILES}
				maxFileSize={MAX_FILE_SIZE}
			>
				<PromptInputAttachments>
					{(file) => <PromptInputAttachment key={file.id} data={file} />}
				</PromptInputAttachments>
				<PromptInputTextarea
					placeholder="What do you want to build?"
					className="min-h-10"
				/>
				<PromptInputFooter>
					<PromptInputTools className="gap-1.5">
						<ModelPicker
							selectedModel={selectedModel}
							onModelChange={setSelectedModel}
						/>
					</PromptInputTools>
					<div className="flex items-center gap-2">
						<PlusMenu />
						<PromptInputSubmit className="size-[23px] rounded-full border border-transparent bg-foreground/10 p-[5px] shadow-none hover:bg-foreground/20">
							<ArrowUpIcon className="size-3.5 text-muted-foreground" />
						</PromptInputSubmit>
					</div>
				</PromptInputFooter>
			</PromptInput>
			<div className="flex items-center gap-2 border-t border-border/50 px-3 py-2">
				<RepoSelector
					selectedRepo={selectedRepo}
					onRepoChange={setSelectedRepo}
				/>
				<BranchSelector
					selectedBranch={selectedBranch}
					onBranchChange={setSelectedBranch}
				/>
			</div>
		</div>
	);
}

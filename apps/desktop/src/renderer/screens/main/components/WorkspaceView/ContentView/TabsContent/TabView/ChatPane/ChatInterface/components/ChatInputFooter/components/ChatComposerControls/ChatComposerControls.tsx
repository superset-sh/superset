import {
	PromptInputFooter,
	PromptInputSubmit,
	PromptInputTools,
} from "@superset/ui/ai-elements/prompt-input";
import { ThinkingToggle } from "@superset/ui/ai-elements/thinking-toggle";
import type { ChatStatus } from "ai";
import type React from "react";
import type { ModelOption, PermissionMode } from "../../../../types";
import { ModelPicker } from "../../../ModelPicker";
import { PermissionModePicker } from "../../../PermissionModePicker";
import { PlusMenu } from "../../../PlusMenu";

interface ChatComposerControlsProps {
	availableModels: ModelOption[];
	selectedModel: ModelOption | null;
	setSelectedModel: React.Dispatch<React.SetStateAction<ModelOption | null>>;
	modelSelectorOpen: boolean;
	setModelSelectorOpen: React.Dispatch<React.SetStateAction<boolean>>;
	permissionMode: PermissionMode;
	setPermissionMode: React.Dispatch<React.SetStateAction<PermissionMode>>;
	thinkingEnabled: boolean;
	setThinkingEnabled: React.Dispatch<React.SetStateAction<boolean>>;
	canAbort: boolean;
	submitStatus?: ChatStatus;
	onStop: (event: React.MouseEvent) => void;
	onLinkIssue: () => void;
}

export function ChatComposerControls({
	availableModels,
	selectedModel,
	setSelectedModel,
	modelSelectorOpen,
	setModelSelectorOpen,
	permissionMode,
	setPermissionMode,
	thinkingEnabled,
	setThinkingEnabled,
	canAbort,
	submitStatus,
	onStop,
	onLinkIssue,
}: ChatComposerControlsProps) {
	return (
		<PromptInputFooter>
			<PromptInputTools>
				<ModelPicker
					models={availableModels}
					selectedModel={selectedModel}
					onSelectModel={setSelectedModel}
					open={modelSelectorOpen}
					onOpenChange={setModelSelectorOpen}
				/>
				<ThinkingToggle
					enabled={thinkingEnabled}
					onToggle={setThinkingEnabled}
				/>
				<PermissionModePicker
					selectedMode={permissionMode}
					onSelectMode={setPermissionMode}
				/>
			</PromptInputTools>
			<div className="flex items-center space-x-2">
				<PlusMenu onLinkIssue={onLinkIssue} />
				<PromptInputSubmit
					status={submitStatus}
					onClick={canAbort ? onStop : undefined}
				/>
			</div>
		</PromptInputFooter>
	);
}

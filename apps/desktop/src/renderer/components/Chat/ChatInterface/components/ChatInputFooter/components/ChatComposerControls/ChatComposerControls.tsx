import {
	PromptInputFooter,
	PromptInputSubmit,
	PromptInputTools,
} from "@superset/ui/ai-elements/prompt-input";
import {
	type ThinkingLevel,
	ThinkingToggle,
} from "@superset/ui/ai-elements/thinking-toggle";
import type { ChatStatus } from "ai";
import { ArrowUpIcon, Loader2Icon, SquareIcon } from "lucide-react";
import type React from "react";
import { PILL_BUTTON_CLASS } from "../../../../styles";
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
	thinkingLevel: ThinkingLevel;
	setThinkingLevel: (level: ThinkingLevel) => void;
	canAbort: boolean;
	submitStatus?: ChatStatus;
	submitDisabled?: boolean;
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
	thinkingLevel,
	setThinkingLevel,
	canAbort,
	submitStatus,
	submitDisabled,
	onStop,
	onLinkIssue,
}: ChatComposerControlsProps) {
	return (
		<PromptInputFooter>
			<PromptInputTools className="gap-1.5">
				<PermissionModePicker
					selectedMode={permissionMode}
					onSelectMode={setPermissionMode}
				/>
				<ModelPicker
					models={availableModels}
					selectedModel={selectedModel}
					onSelectModel={setSelectedModel}
					open={modelSelectorOpen}
					onOpenChange={setModelSelectorOpen}
				/>
				<ThinkingToggle
					level={thinkingLevel}
					onLevelChange={setThinkingLevel}
					className={PILL_BUTTON_CLASS}
				/>
			</PromptInputTools>
			<div className="flex items-center gap-2">
				<PlusMenu onLinkIssue={onLinkIssue} />
				<PromptInputSubmit
					className="size-[23px] rounded-full border border-transparent bg-foreground/10 shadow-none p-[5px] hover:bg-foreground/20"
					status={submitStatus}
					disabled={!canAbort && submitDisabled}
					onClick={canAbort ? onStop : undefined}
				>
					{canAbort ? (
						<SquareIcon className="size-3.5 text-muted-foreground" />
					) : submitStatus === "submitted" || submitDisabled ? (
						<Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
					) : (
						<ArrowUpIcon className="size-3.5 text-muted-foreground" />
					)}
				</PromptInputSubmit>
			</div>
		</PromptInputFooter>
	);
}

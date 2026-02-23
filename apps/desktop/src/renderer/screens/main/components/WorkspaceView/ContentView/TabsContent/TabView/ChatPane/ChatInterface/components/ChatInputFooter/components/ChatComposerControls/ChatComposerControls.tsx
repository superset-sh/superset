import type { ChatMcpStatus } from "@superset/chat/client";
import {
	PromptInputFooter,
	PromptInputSubmit,
	PromptInputTools,
} from "@superset/ui/ai-elements/prompt-input";
import { ThinkingToggle } from "@superset/ui/ai-elements/thinking-toggle";
import type { ChatStatus } from "ai";
import { ArrowUpIcon, Loader2Icon, SquareIcon } from "lucide-react";
import type React from "react";
import type { ChatPickerState } from "../../../../hooks/useChatPickerState";
import { PILL_BUTTON_CLASS } from "../../../../styles";
import type { ModelOption, PermissionMode } from "../../../../types";
import { McpStatusPicker } from "../../../McpStatusPicker";
import { ModelPicker } from "../../../ModelPicker";
import { PermissionModePicker } from "../../../PermissionModePicker";
import { PlusMenu } from "../../../PlusMenu";

interface ChatComposerControlsProps {
	availableModels: ModelOption[];
	selectedModel: ModelOption | null;
	setSelectedModel: React.Dispatch<React.SetStateAction<ModelOption | null>>;
	pickerState: ChatPickerState;
	mcpStatus: ChatMcpStatus | null;
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
	pickerState,
	mcpStatus,
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
			<PromptInputTools className="gap-1.5">
				<PermissionModePicker
					selectedMode={permissionMode}
					onSelectMode={setPermissionMode}
				/>
				<ModelPicker
					models={availableModels}
					selectedModel={selectedModel}
					onSelectModel={setSelectedModel}
					open={pickerState.model.open}
					onOpenChange={pickerState.model.setOpen}
				/>
				<McpStatusPicker
					mcp={mcpStatus}
					open={pickerState.mcp.open}
					onOpenChange={pickerState.mcp.setOpen}
				/>
				<ThinkingToggle
					enabled={thinkingEnabled}
					onToggle={setThinkingEnabled}
					className={`${PILL_BUTTON_CLASS} w-[23px] [&>svg]:size-3.5`}
				/>
			</PromptInputTools>
			<div className="flex items-center gap-2">
				<PlusMenu onLinkIssue={onLinkIssue} />
				<PromptInputSubmit
					className="size-[23px] rounded-full border border-transparent bg-foreground/10 shadow-none p-[5px] hover:bg-foreground/20"
					status={submitStatus}
					onClick={canAbort ? onStop : undefined}
				>
					{submitStatus === "submitted" ? (
						<Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
					) : submitStatus === "streaming" ? (
						<SquareIcon className="size-3.5 text-muted-foreground" />
					) : (
						<ArrowUpIcon className="size-3.5 text-muted-foreground" />
					)}
				</PromptInputSubmit>
			</div>
		</PromptInputFooter>
	);
}

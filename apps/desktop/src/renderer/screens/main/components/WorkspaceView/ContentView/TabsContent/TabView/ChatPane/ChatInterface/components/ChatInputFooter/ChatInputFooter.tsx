import type { SlashCommand } from "@superset/durable-session/react";
import {
	PromptInput,
	PromptInputButton,
	PromptInputFooter,
	PromptInputProvider,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputTools,
} from "@superset/ui/ai-elements/prompt-input";
import { ThinkingToggle } from "@superset/ui/ai-elements/thinking-toggle";
import type React from "react";
import { HiMiniPaperClip } from "react-icons/hi2";
import type { ModelOption, PermissionMode } from "../../types";
import {
	FileMentionAnchor,
	FileMentionProvider,
	FileMentionTrigger,
} from "../FileMentionPopover";
import { ModelPicker } from "../ModelPicker";
import { PermissionModePicker } from "../PermissionModePicker";
import { SlashCommandInput } from "../SlashCommandInput";

interface ChatInputFooterProps {
	cwd: string;
	error: string | null;
	isStreaming: boolean;
	availableModels: ModelOption[];
	selectedModel: ModelOption;
	setSelectedModel: React.Dispatch<React.SetStateAction<ModelOption>>;
	modelSelectorOpen: boolean;
	setModelSelectorOpen: React.Dispatch<React.SetStateAction<boolean>>;
	permissionMode: PermissionMode;
	setPermissionMode: React.Dispatch<React.SetStateAction<PermissionMode>>;
	thinkingEnabled: boolean;
	setThinkingEnabled: React.Dispatch<React.SetStateAction<boolean>>;
	slashCommands: SlashCommand[];
	onSend: (message: { text: string }) => void;
	onStop: (e: React.MouseEvent) => void;
	onSlashCommandSend: (command: SlashCommand) => void;
}

export function ChatInputFooter({
	cwd,
	error,
	isStreaming,
	availableModels,
	selectedModel,
	setSelectedModel,
	modelSelectorOpen,
	setModelSelectorOpen,
	permissionMode,
	setPermissionMode,
	thinkingEnabled,
	setThinkingEnabled,
	slashCommands,
	onSend,
	onStop,
	onSlashCommandSend,
}: ChatInputFooterProps) {
	return (
		<div className="border-t bg-background px-4 py-3">
			<div className="mx-auto w-full max-w-3xl">
				{error && (
					<div className="mb-3 select-text rounded-md border border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive">
						{error}
					</div>
				)}
				<PromptInputProvider>
					<FileMentionProvider cwd={cwd}>
						<SlashCommandInput
							onCommandSend={onSlashCommandSend}
							commands={slashCommands}
						>
							<FileMentionAnchor>
								<PromptInput onSubmit={onSend}>
									<PromptInputTextarea placeholder="Ask anything..." />
									<PromptInputFooter>
										<PromptInputTools>
											<PromptInputButton>
												<HiMiniPaperClip className="size-4" />
											</PromptInputButton>
											<FileMentionTrigger />
											<ThinkingToggle
												enabled={thinkingEnabled}
												onToggle={setThinkingEnabled}
											/>
											<ModelPicker
												models={availableModels}
												selectedModel={selectedModel}
												onSelectModel={setSelectedModel}
												open={modelSelectorOpen}
												onOpenChange={setModelSelectorOpen}
											/>
											<PermissionModePicker
												selectedMode={permissionMode}
												onSelectMode={setPermissionMode}
											/>
										</PromptInputTools>
										<PromptInputSubmit
											status={isStreaming ? "streaming" : undefined}
											onClick={isStreaming ? onStop : undefined}
										/>
									</PromptInputFooter>
								</PromptInput>
							</FileMentionAnchor>
						</SlashCommandInput>
					</FileMentionProvider>
				</PromptInputProvider>
			</div>
		</div>
	);
}

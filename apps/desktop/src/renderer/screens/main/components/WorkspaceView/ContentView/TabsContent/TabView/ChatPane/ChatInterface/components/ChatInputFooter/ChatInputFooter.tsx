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
import type { SlashCommand } from "../../hooks/useSlashCommands";
import type { ModelOption, PermissionMode, TokenUsage } from "../../types";
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
	selectedModel: ModelOption;
	setSelectedModel: React.Dispatch<React.SetStateAction<ModelOption>>;
	modelSelectorOpen: boolean;
	setModelSelectorOpen: React.Dispatch<React.SetStateAction<boolean>>;
	permissionMode: PermissionMode;
	setPermissionMode: React.Dispatch<React.SetStateAction<PermissionMode>>;
	thinkingEnabled: boolean;
	setThinkingEnabled: React.Dispatch<React.SetStateAction<boolean>>;
	turnUsage: TokenUsage;
	sessionUsage: TokenUsage;
	onSend: (message: { text: string }) => void;
	onStop: (e: React.MouseEvent) => void;
	onSlashCommandSend: (command: SlashCommand) => void;
}

export function ChatInputFooter({
	cwd,
	error,
	isStreaming,
	selectedModel,
	setSelectedModel,
	modelSelectorOpen,
	setModelSelectorOpen,
	permissionMode,
	setPermissionMode,
	thinkingEnabled,
	setThinkingEnabled,
	turnUsage,
	sessionUsage,
	onSend,
	onStop,
	onSlashCommandSend,
}: ChatInputFooterProps) {
	return (
		<div className="bg-background px-4 py-3">
			<div className="mx-auto w-full max-w-3xl">
				{error && (
					<div className="mb-3 select-text rounded-md border border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive">
						{error}
					</div>
				)}
				<PromptInputProvider>
					<FileMentionProvider cwd={cwd}>
						<SlashCommandInput onCommandSend={onSlashCommandSend} cwd={cwd}>
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
										<div className="flex items-center gap-2">
											{sessionUsage.totalTokens > 0 && (
												<span
													className="text-[10px] tabular-nums text-muted-foreground"
													title={`Turn: ${turnUsage.totalTokens.toLocaleString()} tokens | Session: ${sessionUsage.totalTokens.toLocaleString()} tokens`}
												>
													{turnUsage.totalTokens > 0 && isStreaming
														? `${turnUsage.totalTokens.toLocaleString()} tok`
														: `${sessionUsage.totalTokens.toLocaleString()} tok`}
												</span>
											)}
											<PromptInputSubmit
												status={isStreaming ? "streaming" : undefined}
												onClick={isStreaming ? onStop : undefined}
											/>
										</div>
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

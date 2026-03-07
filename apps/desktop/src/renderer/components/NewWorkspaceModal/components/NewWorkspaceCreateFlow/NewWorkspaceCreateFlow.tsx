import {
	STARTABLE_AGENT_LABELS,
	type StartableAgentType,
} from "@superset/shared/agent-launch";
import { Button } from "@superset/ui/button";
import { Kbd, KbdGroup } from "@superset/ui/kbd";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Textarea } from "@superset/ui/textarea";
import type { ReactNode, RefObject } from "react";
import { GoGitBranch } from "react-icons/go";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { useHotkeysStore } from "renderer/stores/hotkeys";
import { OPEN_AGENT_SETTINGS_OPTION } from "shared/utils/agent-preset-settings";

export type WorkspaceCreateAgent = StartableAgentType | "none";

interface NewWorkspaceCreateFlowProps {
	projectSelector: ReactNode;
	selectedAgent: WorkspaceCreateAgent;
	agentOptions: readonly StartableAgentType[];
	agentLabels?: Partial<Record<StartableAgentType, string>>;
	onSelectedAgentChange: (agent: WorkspaceCreateAgent) => void;
	onOpenAgentSettings?: () => void;
	title: string;
	onTitleChange: (value: string) => void;
	titleInputRef: RefObject<HTMLTextAreaElement | null>;
	showBranchPreview: boolean;
	branchPreview: string;
	effectiveBaseBranch: string | null;
	onCreateWorkspace: () => void;
	isCreateDisabled: boolean;
	advancedOptions: ReactNode;
}

export function NewWorkspaceCreateFlow({
	projectSelector,
	selectedAgent,
	agentOptions,
	agentLabels,
	onSelectedAgentChange,
	onOpenAgentSettings,
	title,
	onTitleChange,
	titleInputRef,
	showBranchPreview,
	branchPreview,
	effectiveBaseBranch,
	onCreateWorkspace,
	isCreateDisabled,
	advancedOptions,
}: NewWorkspaceCreateFlowProps) {
	const isDark = useIsDarkTheme();
	const platform = useHotkeysStore((state) => state.platform);
	const modKey = platform === "darwin" || platform === undefined ? "⌘" : "Ctrl";

	return (
		<div className="space-y-3 min-w-0">
			<div className="flex items-end gap-3 min-w-0">
				<div className="flex-1 min-w-0">{projectSelector}</div>
				<div className="shrink-0 max-w-[45%]">
					<Select
						value={selectedAgent}
						onValueChange={(value) => {
							if (value === OPEN_AGENT_SETTINGS_OPTION) {
								onOpenAgentSettings?.();
								return;
							}
							onSelectedAgentChange(value as WorkspaceCreateAgent);
						}}
					>
						<SelectTrigger className="h-8 text-xs w-auto max-w-full">
							<SelectValue placeholder="No agent" className="truncate" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">No agent</SelectItem>
							{agentOptions.map((agent) => {
								const icon = getPresetIcon(agent, isDark);
								const label =
									agentLabels?.[agent] ?? STARTABLE_AGENT_LABELS[agent];
								return (
									<SelectItem key={agent} value={agent}>
										<span className="flex items-center gap-2">
											{icon && (
												<img
													src={icon}
													alt=""
													className="size-3.5 object-contain"
												/>
											)}
											{label}
										</span>
									</SelectItem>
								);
							})}
							<SelectSeparator />
							<SelectItem value={OPEN_AGENT_SETTINGS_OPTION}>
								Agent settings...
							</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>

			<Textarea
				ref={titleInputRef}
				id="title"
				className="min-h-20 min-w-0 w-full max-w-full field-sizing-fixed text-sm resize-y"
				placeholder="What do you want to do?"
				value={title}
				onChange={(e) => onTitleChange(e.target.value)}
			/>

			{showBranchPreview && (
				<p className="text-xs text-muted-foreground grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 min-w-0">
					<GoGitBranch className="size-3" />
					<span className="font-mono min-w-0 truncate">
						{branchPreview || "branch-name"}
					</span>
					<span className="text-muted-foreground/60 whitespace-nowrap">
						from {effectiveBaseBranch ?? "..."}
					</span>
				</p>
			)}

			<Button
				className="w-full h-8 text-sm"
				onClick={onCreateWorkspace}
				disabled={isCreateDisabled}
			>
				Create Workspace
				<KbdGroup className="ml-1.5 opacity-70">
					<Kbd className="bg-primary-foreground/15 text-primary-foreground h-4 min-w-4 text-[10px]">
						{modKey}
					</Kbd>
					<Kbd className="bg-primary-foreground/15 text-primary-foreground h-4 min-w-4 text-[10px]">
						↵
					</Kbd>
				</KbdGroup>
			</Button>

			{advancedOptions}
		</div>
	);
}

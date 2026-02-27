import {
	AGENT_LABELS,
	AGENT_TYPES,
	type AgentType,
} from "@superset/shared/agent-command";
import { Button } from "@superset/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Textarea } from "@superset/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { ReactNode, RefObject } from "react";
import { GoGitBranch } from "react-icons/go";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";

export type WorkspaceCreateAgent = AgentType | "none";

interface NewWorkspaceCreateFlowProps {
	projectSelector: ReactNode;
	selectedAgent: WorkspaceCreateAgent;
	onSelectedAgentChange: (agent: WorkspaceCreateAgent) => void;
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
	onSelectedAgentChange,
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

	return (
		<div className="space-y-3 min-w-0">
			<div className="flex items-end gap-3 min-w-0">
				<div className="flex-1 min-w-0">{projectSelector}</div>
				<div className="shrink-0 max-w-[45%]">
					<Select
						value={selectedAgent}
						onValueChange={(value: WorkspaceCreateAgent) =>
							onSelectedAgentChange(value)
						}
					>
						<Tooltip>
							<TooltipTrigger asChild>
								<SelectTrigger className="h-8 text-xs w-auto max-w-full">
									<SelectValue placeholder="No agent" className="truncate" />
								</SelectTrigger>
							</TooltipTrigger>
							<TooltipContent side="bottom" showArrow={false}>
								Send the description as prompt to the agent
							</TooltipContent>
						</Tooltip>
						<SelectContent>
							<SelectItem value="none">No agent</SelectItem>
							{AGENT_TYPES.map((agent) => {
								const icon = getPresetIcon(agent, isDark);
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
											{AGENT_LABELS[agent]}
										</span>
									</SelectItem>
								);
							})}
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
			</Button>

			{advancedOptions}
		</div>
	);
}

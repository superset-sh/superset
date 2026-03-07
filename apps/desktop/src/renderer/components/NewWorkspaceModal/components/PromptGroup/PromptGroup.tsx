import {
	STARTABLE_AGENT_LABELS,
	STARTABLE_AGENT_TYPES,
	type StartableAgentType,
} from "@superset/shared/agent-launch";
import { Button } from "@superset/ui/button";
import { Kbd, KbdGroup } from "@superset/ui/kbd";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Textarea } from "@superset/ui/textarea";
import { useRef, useState } from "react";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";

type WorkspaceCreateAgent = StartableAgentType | "none";

const AGENT_STORAGE_KEY = "lastSelectedWorkspaceCreateAgent";

export function PromptGroup() {
	const isDark = useIsDarkTheme();
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [prompt, setPrompt] = useState("");
	const [selectedAgent, setSelectedAgent] = useState<WorkspaceCreateAgent>(
		() => {
			if (typeof window === "undefined") return "none";
			const stored = window.localStorage.getItem(AGENT_STORAGE_KEY);
			if (stored === "none") return "none";
			return stored &&
				(STARTABLE_AGENT_TYPES as readonly string[]).includes(stored)
				? (stored as WorkspaceCreateAgent)
				: "none";
		},
	);

	const handleAgentChange = (value: WorkspaceCreateAgent) => {
		setSelectedAgent(value);
		window.localStorage.setItem(AGENT_STORAGE_KEY, value);
	};

	return (
		<div className="p-3 space-y-3" cmdk-group="">
			<Select
				value={selectedAgent}
				onValueChange={(value: WorkspaceCreateAgent) =>
					handleAgentChange(value)
				}
			>
				<SelectTrigger className="h-8 text-xs w-full">
					<SelectValue placeholder="No agent" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="none">No agent</SelectItem>
					{(STARTABLE_AGENT_TYPES as readonly StartableAgentType[]).map(
						(agent) => {
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
										{STARTABLE_AGENT_LABELS[agent]}
									</span>
								</SelectItem>
							);
						},
					)}
				</SelectContent>
			</Select>

			<Textarea
				ref={textareaRef}
				className="min-h-24 text-sm resize-y field-sizing-fixed"
				placeholder="What do you want to do?"
				value={prompt}
				onChange={(e) => setPrompt(e.target.value)}
			/>

			<Button
				className="w-full h-8 text-sm"
				onClick={() => {
					console.log("[mock] Create workspace with prompt:", prompt);
				}}
			>
				Create Workspace
				<KbdGroup className="ml-1.5 opacity-70">
					<Kbd className="bg-primary-foreground/15 text-primary-foreground h-4 min-w-4 text-[10px]">
						⌘
					</Kbd>
					<Kbd className="bg-primary-foreground/15 text-primary-foreground h-4 min-w-4 text-[10px]">
						↵
					</Kbd>
				</KbdGroup>
			</Button>
		</div>
	);
}

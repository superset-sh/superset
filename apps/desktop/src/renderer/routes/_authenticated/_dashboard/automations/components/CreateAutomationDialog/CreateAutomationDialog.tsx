import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { toast } from "@superset/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { LuX } from "react-icons/lu";
import { EmojiTextInput } from "renderer/components/EmojiTextInput";
import { MarkdownEditor } from "renderer/components/MarkdownEditor";
import { useEnabledAgents } from "renderer/hooks/useEnabledAgents";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { DevicePicker } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker";
import { useWorkspaceHostOptions } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/hooks/useWorkspaceHostOptions/useWorkspaceHostOptions";
import { hideAll as hideAllTippy } from "tippy.js";
import { useProjectFileSearch } from "../../hooks/useProjectFileSearch";
import { useRecentProjects } from "../../hooks/useRecentProjects";
import type { AutomationTemplate } from "../../templates";
import { AgentPicker } from "../AgentPicker";
import { ProjectPicker } from "../ProjectPicker";
import { SchedulePicker } from "../SchedulePicker";
import { WorkspacePicker } from "../WorkspacePicker";
import { TemplateGalleryPanel } from "./components/TemplateGalleryPanel";

export type AutomationCreatedPayload = { id: string; name: string };

interface CreateAutomationDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated: (automation: AutomationCreatedPayload) => void;
	initialTemplate?: AutomationTemplate | null;
}

const DEFAULT_TIMEZONE =
	Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const DEFAULT_RRULE = "FREQ=DAILY;BYHOUR=9;BYMINUTE=0";

export function CreateAutomationDialog({
	open,
	onOpenChange,
	onCreated,
	initialTemplate,
}: CreateAutomationDialogProps) {
	const [view, setView] = useState<"compose" | "gallery">("compose");
	const [name, setName] = useState("");
	const [prompt, setPrompt] = useState("");
	const [hostId, setHostId] = useState<string | null>(null);
	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
		null,
	);
	const [agentType, setAgentType] = useState("claude");
	const [rrule, setRrule] = useState(DEFAULT_RRULE);
	const [v2WorkspaceId, setV2WorkspaceId] = useState<string | null>(null);

	const { localHostId } = useWorkspaceHostOptions();
	const recentProjects = useRecentProjects();
	const { agents: enabledAgents } = useEnabledAgents();
	const searchFiles = useProjectFileSearch({
		hostId,
		projectId: selectedProjectId,
	});
	const selectedProject = recentProjects.find(
		(project) => project.id === selectedProjectId,
	);
	const selectedAgentConfig = enabledAgents.find(
		(agent) => agent.id === agentType,
	);

	// Default to first project once the Electric-synced list lands.
	useEffect(() => {
		if (!open) return;
		if (selectedProjectId) return;
		const first = recentProjects[0];
		if (first) setSelectedProjectId(first.id);
	}, [open, selectedProjectId, recentProjects]);

	const applyTemplate = useCallback((template: AutomationTemplate) => {
		setName(template.name);
		setPrompt(template.prompt);
		if (template.agentType) setAgentType(template.agentType);
		if (template.rrule) setRrule(template.rrule);
	}, []);

	// Pre-fill when opened with an initialTemplate (from the empty-state gallery).
	useEffect(() => {
		if (!open) return;
		if (!initialTemplate) return;
		applyTemplate(initialTemplate);
	}, [open, initialTemplate, applyTemplate]);

	useEffect(() => {
		if (!open) {
			setView("compose");
			setName("");
			setPrompt("");
			setHostId(null);
			setSelectedProjectId(null);
			setAgentType("claude");
			setRrule(DEFAULT_RRULE);
			setV2WorkspaceId(null);
		}
	}, [open]);

	const targetHostId = hostId ?? localHostId;

	const createMutation = useMutation({
		mutationFn: () => {
			if (!selectedAgentConfig) throw new Error("No agent selected");
			if (!selectedProjectId) throw new Error("No project selected");
			return apiTrpcClient.automation.create.mutate({
				name,
				prompt,
				agentConfig: selectedAgentConfig,
				targetHostId: targetHostId ?? null,
				v2ProjectId: selectedProjectId,
				v2WorkspaceId,
				rrule: rrule.trim(),
				timezone: DEFAULT_TIMEZONE,
				mcpScope: [],
			});
		},
		onSuccess: (result) => {
			toast.success(`Automation "${result.name}" created`);
			onCreated({ id: result.id, name: result.name });
		},
		onError: (error) => {
			console.error("[CreateAutomation] create failed:", error);
		},
	});

	const humanReadableCreateError = (() => {
		if (!createMutation.isError) return null;
		const error = createMutation.error;
		if (!(error instanceof Error)) return "Failed to create automation";
		// Raw Postgres errors are multi-line SQL dumps — keep the first line only.
		const firstLine = error.message.split("\n")[0]?.trim();
		if (!firstLine) return "Failed to create automation";
		return firstLine.length > 160 ? `${firstLine.slice(0, 160)}…` : firstLine;
	})();

	const canSubmit =
		name.trim().length > 0 &&
		prompt.trim().length > 0 &&
		!!selectedProjectId &&
		!!targetHostId &&
		!!selectedAgentConfig &&
		rrule.trim().length > 0 &&
		!createMutation.isPending;

	const handleTemplatePicked = (template: AutomationTemplate) => {
		applyTemplate(template);
		setView("compose");
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="sm:max-w-[960px] p-0 gap-0 overflow-hidden"
				aria-describedby={undefined}
				showCloseButton={false}
				onPointerDownOutside={(event) => event.preventDefault()}
				onInteractOutside={(event) => event.preventDefault()}
				onEscapeKeyDown={(event) => {
					// Radix listens at document-capture phase, so it intercepts Escape
					// before the editor's target-level Suggestion handler runs. If any
					// tippy popup is visible (emoji / file / slash), hide it here and
					// preventDefault so the dialog doesn't close too.
					if (!document.querySelector('.tippy-box[data-state="visible"]')) {
						return;
					}
					event.preventDefault();
					hideAllTippy();
				}}
			>
				<div
					className="flex flex-col overflow-hidden transition-[height] duration-200 ease-out"
					style={{ height: view === "compose" ? 400 : 560 }}
				>
					{view === "compose" ? (
						<>
							<DialogHeader className="flex-row items-center gap-2 p-4 pb-0 space-y-0">
								<div className="flex-1">
									<DialogTitle className="sr-only">New automation</DialogTitle>
									<EmojiTextInput
										value={name}
										onChange={setName}
										placeholder="Automation title"
										className="text-base font-medium"
									/>
								</div>
								<Button
									variant="outline"
									size="sm"
									onClick={() => setView("gallery")}
								>
									Use template
								</Button>
								<DialogClose asChild>
									<Button variant="ghost" size="icon-sm" aria-label="Close">
										<LuX className="size-4" />
									</Button>
								</DialogClose>
							</DialogHeader>

							<div className="flex-1 min-h-0 px-4 pt-2 flex flex-col overflow-y-auto">
								<MarkdownEditor
									content={prompt}
									onChange={setPrompt}
									placeholder="Add prompt e.g. look for crashes in $sentry"
									className="flex-1 flex flex-col min-h-0"
									editorClassName="flex-1 min-h-[200px]"
									searchFiles={searchFiles}
								/>

								{humanReadableCreateError && (
									<p className="text-destructive text-sm mt-2 line-clamp-2">
										{humanReadableCreateError}
									</p>
								)}
							</div>

							<DialogFooter className="flex-row items-center justify-between gap-2 border-t p-3 sm:justify-between">
								<div className="flex items-center gap-2">
									<DevicePicker
										className="w-[160px]"
										hostId={hostId}
										onSelectHostId={(next) => {
											setHostId(next);
											setV2WorkspaceId(null);
										}}
									/>
									<ProjectPicker
										className="w-[120px]"
										selectedProject={selectedProject}
										recentProjects={recentProjects}
										onSelectProject={(id) => {
											setSelectedProjectId(id);
											setV2WorkspaceId(null);
										}}
									/>
									<WorkspacePicker
										className="w-[160px]"
										hostId={targetHostId ?? null}
										projectId={selectedProjectId}
										value={v2WorkspaceId}
										onChange={setV2WorkspaceId}
									/>
									<SchedulePicker
										className="w-[164px]"
										rrule={rrule}
										onRruleChange={setRrule}
									/>
									<AgentPicker
										className="w-[100px]"
										value={agentType}
										onChange={setAgentType}
									/>
								</div>

								<div className="flex items-center gap-2">
									<DialogClose asChild>
										<Button variant="ghost">Cancel</Button>
									</DialogClose>
									<Button
										disabled={!canSubmit}
										onClick={() => createMutation.mutate()}
									>
										{createMutation.isPending ? "Creating…" : "Create"}
									</Button>
								</div>
							</DialogFooter>
						</>
					) : (
						<>
							<DialogTitle className="sr-only">
								Automation templates
							</DialogTitle>
							<TemplateGalleryPanel
								onBack={() => setView("compose")}
								onSelectTemplate={handleTemplatePicked}
							/>
						</>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

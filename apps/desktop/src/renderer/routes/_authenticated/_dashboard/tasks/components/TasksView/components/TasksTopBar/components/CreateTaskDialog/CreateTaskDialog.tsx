import { authClient } from "@superset/auth/client";
import type { TaskPriority } from "@superset/db/enums";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Kbd, KbdGroup } from "@superset/ui/kbd";
import { toast } from "@superset/ui/sonner";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { HiChevronRight, HiSparkles, HiXMark } from "react-icons/hi2";
import { MarkdownEditor } from "renderer/components/MarkdownEditor";
import { PLATFORM } from "renderer/hotkeys";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { showHostServiceUnavailableToast } from "renderer/lib/host-service-unavailable";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { isProjectlessTaskFilter } from "../../../../../../stores/tasks-filter-state";
import { compareStatusesForDropdown } from "../../../../utils/sorting";
import type { TabValue } from "../../TasksTopBar";
import { CreateTaskAssigneePicker } from "./components/CreateTaskAssigneePicker";
import { CreateTaskDueDatePicker } from "./components/CreateTaskDueDatePicker";
import { CreateTaskLabelsInput } from "./components/CreateTaskLabelsInput";
import { CreateTaskPriorityPicker } from "./components/CreateTaskPriorityPicker";
import { CreateTaskProjectPicker } from "./components/CreateTaskProjectPicker";
import { CreateTaskStatusPicker } from "./components/CreateTaskStatusPicker";

interface CreateTaskDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	currentTab: TabValue;
	searchQuery: string;
	assigneeFilter: string | null;
	projectFilter: string | null;
}

export function CreateTaskDialog({
	open,
	onOpenChange,
	currentTab,
	searchQuery,
	assigneeFilter,
	projectFilter,
}: CreateTaskDialogProps) {
	const collections = useCollections();
	const { data: session } = authClient.useSession();
	const hostService = useLocalHostService();
	const navigate = useNavigate();
	const modKey = PLATFORM === "mac" ? "⌘" : "Ctrl";
	const titleInputRef = useRef<HTMLInputElement>(null);
	const wasOpenRef = useRef(false);
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [statusId, setStatusId] = useState<string | null>(null);
	const [priority, setPriority] = useState<TaskPriority>("none");
	const [assigneeId, setAssigneeId] = useState<string | null>(null);
	const [dueDate, setDueDate] = useState("");
	const [labels, setLabels] = useState<string[]>([]);
	const [v2ProjectId, setV2ProjectId] = useState<string | null>(null);
	const [isCreating, setIsCreating] = useState(false);
	const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);

	const { data: statusData } = useLiveQuery(
		(q) =>
			q
				.from({ taskStatuses: collections.taskStatuses })
				.select(({ taskStatuses }) => ({ ...taskStatuses })),
		[collections],
	);

	const { data: userData } = useLiveQuery(
		(q) =>
			q
				.from({ users: collections.users })
				.select(({ users }) => ({ ...users })),
		[collections],
	);
	const { data: organizationData } = useLiveQuery(
		(q) =>
			q
				.from({ organizations: collections.organizations })
				.select(({ organizations }) => ({ ...organizations })),
		[collections],
	);
	const { data: projectData } = useLiveQuery(
		(q) => q.from({ projects: collections.v2Projects }),
		[collections],
	);

	const statuses = useMemo(() => statusData ?? [], [statusData]);
	const users = useMemo(() => userData ?? [], [userData]);
	const projects = useMemo(() => projectData ?? [], [projectData]);
	const activeOrganizationId = session?.session?.activeOrganizationId ?? null;
	const organizationLabel = useMemo(() => {
		const organization = organizationData?.find(
			(org) => org.id === activeOrganizationId,
		);
		return organization?.name ?? "Task";
	}, [activeOrganizationId, organizationData]);

	const defaultStatusId = useMemo(() => {
		const sortedStatuses = [...statuses].sort(compareStatusesForDropdown);
		return (
			sortedStatuses.find((status) => status.type === "backlog")?.id ??
			sortedStatuses[0]?.id ??
			null
		);
	}, [statuses]);

	useEffect(() => {
		if (open && statusId === null && defaultStatusId) {
			setStatusId(defaultStatusId);
		}
	}, [defaultStatusId, open, statusId]);

	useEffect(() => {
		const justOpened = open && !wasOpenRef.current;
		const justClosed = !open && wasOpenRef.current;
		wasOpenRef.current = open;

		if (justOpened) {
			setV2ProjectId(
				projectFilter && !isProjectlessTaskFilter(projectFilter)
					? projectFilter
					: null,
			);
			return;
		}

		if (!justClosed) return;

		setTitle("");
		setDescription("");
		setStatusId(defaultStatusId);
		setPriority("none");
		setAssigneeId(null);
		setDueDate("");
		setLabels([]);
		setV2ProjectId(null);
		setIsCreating(false);
		setIsGeneratingDraft(false);
	}, [defaultStatusId, open, projectFilter]);

	const currentStatusType = useMemo(
		() => statuses.find((status) => status.id === statusId)?.type,
		[statusId, statuses],
	);

	const buildTaskPolishPrompt = () => {
		const trimmedTitle = title.trim();
		const trimmedDescription = description.trim();
		if (!trimmedTitle && !trimmedDescription) return "";

		return [
			"Polish this task draft. Keep the user's intent, return a clearer title and a concise markdown description.",
			"If labels, priority, or an explicit YYYY-MM-DD due date are obvious from the text, include them; otherwise leave metadata neutral.",
			"",
			trimmedTitle ? `Current title:\n${trimmedTitle}` : null,
			trimmedDescription ? `Current description:\n${trimmedDescription}` : null,
		]
			.filter(Boolean)
			.join("\n\n");
	};

	const handlePolishDraft = async () => {
		if (isGeneratingDraft) return;
		const prompt = buildTaskPolishPrompt();
		if (!prompt) {
			toast.error("Add a title or description first");
			return;
		}
		if (!hostService.activeHostUrl) {
			showHostServiceUnavailableToast(hostService, {
				action: "draft a task",
			});
			return;
		}

		setIsGeneratingDraft(true);
		try {
			const draft = await getHostServiceClientByUrl(
				hostService.activeHostUrl,
			).modelProviders.generateTaskDraft.mutate({ prompt });

			setTitle(draft.title);
			setDescription(draft.description ?? description);
			if (draft.priority && draft.priority !== "none") {
				setPriority(draft.priority);
			}
			if (draft.labels.length > 0) {
				setLabels(draft.labels);
			}
			if (draft.dueDate) {
				setDueDate(draft.dueDate);
			}
			toast.success("Task polished");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to polish task",
			);
		} finally {
			setIsGeneratingDraft(false);
		}
	};

	const handleCreate = async () => {
		if (!title.trim() || isCreating) return;

		setIsCreating(true);

		try {
			const result = await apiTrpcClient.task.create.mutate({
				title: title.trim(),
				description: description.trim() || null,
				statusId,
				priority,
				assigneeId,
				dueDate: dueDate ? new Date(`${dueDate}T00:00:00`) : null,
				labels,
				v2ProjectId,
			});

			if (!result.task) {
				throw new Error("Task creation returned no task");
			}

			collections.tasks.startSyncImmediate();
			const taskRowReady = collections.tasks.utils.upsertSyncedRow(result.task);
			if (!taskRowReady) {
				console.warn(
					"[tasks] Created task could not be written to the local collection immediately",
					result.task.id,
				);
			}

			const nextSearch: Record<string, string> = {};
			if (currentTab !== "all") nextSearch.tab = currentTab;
			if (assigneeFilter) nextSearch.assignee = assigneeFilter;
			if (searchQuery) nextSearch.search = searchQuery;
			if (projectFilter) nextSearch.project = projectFilter;

			onOpenChange(false);
			toast.success(`Created ${result.task.slug}`);
			navigate({
				to: "/tasks/$taskId",
				params: { taskId: result.task.id },
				search: nextSearch,
			});
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to create task",
			);
			setIsCreating(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				showCloseButton={false}
				className="!top-[calc(50%-min(35vh,320px))] !-translate-y-0 flex h-[min(72vh,640px)] max-h-[min(78vh,720px)] flex-col gap-0 overflow-hidden bg-popover p-0 text-popover-foreground sm:max-w-[960px]"
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					titleInputRef.current?.focus();
				}}
			>
				<DialogHeader className="sr-only">
					<DialogTitle>Create Task</DialogTitle>
					<DialogDescription>
						Create a new task from the desktop tasks view.
					</DialogDescription>
				</DialogHeader>

				<div className="flex items-center justify-between border-b px-4 py-2.5">
					<div className="flex min-w-0 items-center gap-2 text-sm">
						<div className="max-w-40 truncate rounded-md border border-border/60 bg-muted/40 px-2 py-1 font-medium text-muted-foreground">
							{organizationLabel}
						</div>
						<HiChevronRight className="size-3.5 text-muted-foreground" />
						<span className="font-medium">New task</span>
					</div>

					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handlePolishDraft}
							disabled={isCreating || isGeneratingDraft}
						>
							<HiSparkles className="size-4" />
							{isGeneratingDraft ? "Polishing..." : "AI polish"}
						</Button>
						<DialogClose asChild>
							<button
								type="button"
								disabled={isCreating}
								className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
								aria-label="Close"
							>
								<HiXMark className="size-4" />
							</button>
						</DialogClose>
					</div>
				</div>

				<div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
					<input
						ref={titleInputRef}
						type="text"
						value={title}
						onChange={(event) => setTitle(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
								event.preventDefault();
								void handleCreate();
							}
						}}
						placeholder="Task title"
						className="w-full bg-transparent text-3xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/60"
					/>

					<div className="mt-5 flex min-h-0 flex-1">
						<MarkdownEditor
							content={description}
							onChange={setDescription}
							placeholder="Add description..."
							className="flex min-h-0 flex-1 flex-col"
							editorClassName="text-base leading-relaxed"
							onModEnter={handleCreate}
						/>
					</div>
				</div>

				<DialogFooter className="flex-col gap-3 border-t p-3 sm:flex-col sm:justify-between">
					<div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
						<div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
							<CreateTaskStatusPicker
								statuses={statuses}
								value={statusId}
								onChange={setStatusId}
							/>
							<CreateTaskPriorityPicker
								value={priority}
								statusType={currentStatusType}
								onChange={setPriority}
							/>
							<CreateTaskAssigneePicker
								users={users}
								value={assigneeId}
								onChange={setAssigneeId}
							/>
							<CreateTaskProjectPicker
								projects={projects}
								value={v2ProjectId}
								onChange={setV2ProjectId}
							/>
							<CreateTaskDueDatePicker
								value={dueDate}
								onChange={setDueDate}
								disabled={isCreating}
							/>
							<CreateTaskLabelsInput
								value={labels}
								onChange={setLabels}
								disabled={isCreating}
							/>
						</div>

						<div className="flex shrink-0 items-center justify-end gap-2">
							<DialogClose asChild>
								<Button type="button" variant="ghost" disabled={isCreating}>
									Cancel
								</Button>
							</DialogClose>
							<Button
								onClick={handleCreate}
								disabled={!title.trim() || isCreating}
								className="h-10 rounded-full px-5 text-sm"
							>
								{isCreating ? "Creating..." : "Create task"}
								{!isCreating && (
									<KbdGroup className="ml-1.5 opacity-70">
										<Kbd className="bg-primary-foreground/15 text-primary-foreground h-4 min-w-4 text-[10px]">
											{modKey}
										</Kbd>
										<Kbd className="bg-primary-foreground/15 text-primary-foreground h-4 min-w-4 text-[10px]">
											↵
										</Kbd>
									</KbdGroup>
								)}
							</Button>
						</div>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

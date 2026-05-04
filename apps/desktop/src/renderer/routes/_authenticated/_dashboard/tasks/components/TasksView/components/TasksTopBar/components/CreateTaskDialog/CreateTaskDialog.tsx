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
import { HiChevronRight, HiOutlinePaperClip, HiXMark } from "react-icons/hi2";
import { MarkdownEditor } from "renderer/components/MarkdownEditor";
import { PLATFORM } from "renderer/hotkeys";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { compareStatusesForDropdown } from "../../../../utils/sorting";
import type { TabValue } from "../../TasksTopBar";
import { CreateTaskAssigneePicker } from "./components/CreateTaskAssigneePicker";
import { CreateTaskPriorityPicker } from "./components/CreateTaskPriorityPicker";
import { CreateTaskStatusPicker } from "./components/CreateTaskStatusPicker";

interface CreateTaskDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	currentTab: TabValue;
	searchQuery: string;
	assigneeFilter: string | null;
}

export function CreateTaskDialog({
	open,
	onOpenChange,
	currentTab,
	searchQuery,
	assigneeFilter,
}: CreateTaskDialogProps) {
	const collections = useCollections();
	const { data: session } = authClient.useSession();
	const navigate = useNavigate();
	const modKey = PLATFORM === "mac" ? "⌘" : "Ctrl";
	const titleInputRef = useRef<HTMLInputElement>(null);
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [statusId, setStatusId] = useState<string | null>(null);
	const [priority, setPriority] = useState<TaskPriority>("none");
	const [assigneeId, setAssigneeId] = useState<string | null>(null);
	const [isCreating, setIsCreating] = useState(false);

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

	const statuses = useMemo(() => statusData ?? [], [statusData]);
	const users = useMemo(() => userData ?? [], [userData]);
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
		if (open) return;

		setTitle("");
		setDescription("");
		setStatusId(defaultStatusId);
		setPriority("none");
		setAssigneeId(null);
		setIsCreating(false);
	}, [defaultStatusId, open]);

	const currentStatusType = useMemo(
		() => statuses.find((status) => status.id === statusId)?.type,
		[statusId, statuses],
	);
	const handleAttachmentClick = () => {
		toast.info("Attachments are not wired yet");
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
			});

			if (!result.task) {
				throw new Error("Task creation returned no task");
			}

			const nextSearch: Record<string, string> = {};
			if (currentTab !== "all") nextSearch.tab = currentTab;
			if (assigneeFilter) nextSearch.assignee = assigneeFilter;
			if (searchQuery) nextSearch.search = searchQuery;

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
				className="!top-[calc(50%-min(35vh,320px))] !-translate-y-0 flex max-h-[min(72vh,640px)] flex-col gap-0 overflow-hidden bg-popover p-0 text-popover-foreground sm:max-w-[720px]"
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
						<span className="font-medium">New issue</span>
					</div>

					<DialogClose asChild>
						<button
							type="button"
							disabled={isCreating}
							className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							aria-label="Close"
						>
							<HiXMark className="size-4" />
						</button>
					</DialogClose>
				</div>

				<div className="flex min-h-0 flex-1 flex-col px-4 py-4">
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

					<div className="mt-5 flex-1">
						<MarkdownEditor
							content={description}
							onChange={setDescription}
							placeholder="Add description..."
							editorClassName="min-h-[240px] text-base leading-relaxed"
							onModEnter={handleCreate}
						/>
					</div>

					<div className="mt-4 flex flex-wrap items-center gap-2">
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
					</div>
				</div>

				<DialogFooter className="flex-row items-center justify-between border-t px-4 py-3">
					<Button
						variant="ghost"
						size="icon"
						className="h-10 w-10 rounded-full text-muted-foreground"
						onClick={handleAttachmentClick}
						disabled={isCreating}
					>
						<HiOutlinePaperClip className="size-4" />
					</Button>

					<div className="ml-auto flex items-center gap-3">
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
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

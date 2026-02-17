import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { useLiveQuery } from "@tanstack/react-db";
import { type ReactNode, useMemo } from "react";
import {
	HiOutlineDocumentDuplicate,
	HiOutlineTrash,
	HiOutlineUserCircle,
} from "react-icons/hi2";
import { LuPlay } from "react-icons/lu";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useOpenStartWorkingModal } from "renderer/stores/start-working-modal";
import type { TaskWithStatus } from "../../../../hooks/useTasksTable";
import { compareStatusesForDropdown } from "../../../../utils/sorting";
import { AssigneeMenuItems } from "../../../shared/AssigneeMenuItems";
import { ActiveIcon } from "../../../shared/icons/ActiveIcon";
import { PriorityMenuIcon } from "../../../shared/icons/PriorityMenuIcon";
import { PriorityMenuItems } from "../../../shared/PriorityMenuItems";
import { StatusMenuItems } from "../../../shared/StatusMenuItems";

interface TaskContextMenuProps {
	children: ReactNode;
	task: TaskWithStatus;
	onDelete?: () => void;
}

export function TaskContextMenu({
	children,
	task,
	onDelete,
}: TaskContextMenuProps) {
	const collections = useCollections();
	const openStartWorkingModal = useOpenStartWorkingModal();

	// Load statuses for the status submenu
	const { data: allStatuses } = useLiveQuery(
		(q) => q.from({ taskStatuses: collections.taskStatuses }),
		[collections],
	);

	// Load users for the assignee submenu
	const { data: allUsers } = useLiveQuery(
		(q) => q.from({ users: collections.users }),
		[collections],
	);

	const sortedStatuses = useMemo(() => {
		if (!allStatuses) return [];
		return [...allStatuses].sort(compareStatusesForDropdown);
	}, [allStatuses]);

	const users = useMemo(() => allUsers || [], [allUsers]);

	const handleStatusChange = (status: (typeof allStatuses)[0]) => {
		try {
			collections.tasks.update(task.id, (draft) => {
				draft.statusId = status.id;
			});
		} catch (error) {
			console.error("[TaskContextMenu] Failed to update status:", error);
		}
	};

	const handleAssigneeChange = (userId: string | null) => {
		try {
			collections.tasks.update(task.id, (draft) => {
				draft.assigneeId = userId;
			});
		} catch (error) {
			console.error("[TaskContextMenu] Failed to update assignee:", error);
		}
	};

	const handlePriorityChange = (priority: typeof task.priority) => {
		try {
			collections.tasks.update(task.id, (draft) => {
				draft.priority = priority;
			});
		} catch (error) {
			console.error("[TaskContextMenu] Failed to update priority:", error);
		}
	};

	const handleCopyId = () => {
		navigator.clipboard.writeText(task.slug);
	};

	const handleCopyTitle = () => {
		navigator.clipboard.writeText(task.title);
	};

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent className="w-64">
				{/* Status submenu */}
				<ContextMenuSub>
					<ContextMenuSubTrigger>
						<ActiveIcon className="mr-2" />
						<span>Status</span>
					</ContextMenuSubTrigger>
					<ContextMenuSubContent className="w-48">
						<div className="max-h-64 overflow-y-auto">
							<StatusMenuItems
								statuses={sortedStatuses}
								currentStatusId={task.statusId}
								onSelect={handleStatusChange}
								MenuItem={ContextMenuItem}
							/>
						</div>
					</ContextMenuSubContent>
				</ContextMenuSub>

				{/* Assignee submenu */}
				<ContextMenuSub>
					<ContextMenuSubTrigger>
						<HiOutlineUserCircle className="mr-2 size-4" />
						<span>Assignee</span>
					</ContextMenuSubTrigger>
					<ContextMenuSubContent className="w-56">
						<div className="max-h-64 overflow-y-auto">
							<AssigneeMenuItems
								users={users}
								currentAssigneeId={task.assigneeId}
								onSelect={handleAssigneeChange}
								MenuItem={ContextMenuItem}
							/>
						</div>
					</ContextMenuSubContent>
				</ContextMenuSub>

				{/* Priority submenu */}
				<ContextMenuSub>
					<ContextMenuSubTrigger>
						<PriorityMenuIcon className="mr-1" />
						<span>Priority</span>
					</ContextMenuSubTrigger>
					<ContextMenuSubContent className="w-52">
						<PriorityMenuItems
							currentPriority={task.priority}
							statusType={task.status.type}
							onSelect={handlePriorityChange}
							MenuItem={ContextMenuItem}
						/>
					</ContextMenuSubContent>
				</ContextMenuSub>

				<ContextMenuSeparator />

				<ContextMenuItem onClick={() => openStartWorkingModal(task)}>
					<LuPlay />
					Run with Claude
				</ContextMenuItem>

				<ContextMenuSeparator />

				{/* Copy submenu */}
				<ContextMenuSub>
					<ContextMenuSubTrigger>
						<HiOutlineDocumentDuplicate className="mr-2 size-4" />
						<span>Copy</span>
					</ContextMenuSubTrigger>
					<ContextMenuSubContent className="w-48">
						<ContextMenuItem onClick={handleCopyId}>
							<span>Copy ID</span>
						</ContextMenuItem>
						<ContextMenuItem onClick={handleCopyTitle}>
							<span>Copy Title</span>
						</ContextMenuItem>
					</ContextMenuSubContent>
				</ContextMenuSub>

				<ContextMenuSeparator />

				<ContextMenuItem
					onClick={onDelete}
					className="text-destructive focus:text-destructive"
				>
					<HiOutlineTrash className="text-destructive size-4" />
					<span>Delete</span>
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}

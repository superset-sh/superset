import { Trans } from "@lingui/react/macro";
import type { SelectTaskStatus } from "@superset/db/schema";
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
import { type ReactNode, useMemo, useState } from "react";
import {
	HiOutlineDocumentDuplicate,
	HiOutlineTrash,
	HiOutlineUserCircle,
} from "react-icons/hi2";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useOptimisticActions } from "renderer/routes/_authenticated/hooks/useOptimisticActions";
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
	const { tasks: taskActions } = useOptimisticActions();
	const [open, setOpen] = useState(false);

	const { data: allStatuses } = cloudTrpc.task.statuses.list.useQuery(
		undefined,
		{ enabled: open },
	);

	const { data: members } = cloudTrpc.organization.listMembers.useQuery(
		undefined,
		{ enabled: open },
	);

	const sortedStatuses = useMemo(() => {
		if (!allStatuses) return [];
		return [...allStatuses].sort(compareStatusesForDropdown);
	}, [allStatuses]);

	const users = useMemo(
		() => (members ?? []).map((member) => member.user),
		[members],
	);

	const handleStatusChange = (status: SelectTaskStatus) => {
		taskActions.updateStatus(task.id, status.id);
	};

	const handleAssigneeChange = (userId: string | null) => {
		taskActions.updateAssignee(task.id, userId);
	};

	const handlePriorityChange = (priority: typeof task.priority) => {
		taskActions.updatePriority(task.id, priority);
	};

	const { copyToClipboard } = useCopyToClipboard();

	const handleCopyId = () => {
		copyToClipboard(task.slug);
	};

	const handleCopyTitle = () => {
		copyToClipboard(task.title);
	};

	const handleDelete = () => {
		const transaction = taskActions.deleteTask(task.id);
		if (transaction) {
			onDelete?.();
		}
	};

	return (
		<ContextMenu onOpenChange={setOpen}>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent className="w-64">
				<ContextMenuSub>
					<ContextMenuSubTrigger>
						<ActiveIcon className="mr-2" />
						<span>
							<Trans>Status</Trans>
						</span>
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
						<span>
							<Trans>Assignee</Trans>
						</span>
					</ContextMenuSubTrigger>
					<ContextMenuSubContent className="w-56">
						<div className="max-h-64 overflow-y-auto">
							<AssigneeMenuItems
								users={users}
								currentAssigneeId={task.assigneeId}
								hasExternalAssignee={!!task.assigneeExternalId}
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
						<span>
							<Trans>Priority</Trans>
						</span>
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

				{/* Copy submenu */}
				<ContextMenuSub>
					<ContextMenuSubTrigger>
						<HiOutlineDocumentDuplicate className="mr-2 size-4" />
						<span>
							<Trans>Copy</Trans>
						</span>
					</ContextMenuSubTrigger>
					<ContextMenuSubContent className="w-48">
						<ContextMenuItem onClick={handleCopyId}>
							<span>
								<Trans>Copy ID</Trans>
							</span>
						</ContextMenuItem>
						<ContextMenuItem onClick={handleCopyTitle}>
							<span>
								<Trans>Copy Title</Trans>
							</span>
						</ContextMenuItem>
					</ContextMenuSubContent>
				</ContextMenuSub>

				<ContextMenuSeparator />

				<ContextMenuItem
					onSelect={handleDelete}
					className="text-destructive focus:text-destructive"
				>
					<HiOutlineTrash className="text-destructive size-4" />
					<span>
						<Trans>Delete</Trans>
					</span>
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}

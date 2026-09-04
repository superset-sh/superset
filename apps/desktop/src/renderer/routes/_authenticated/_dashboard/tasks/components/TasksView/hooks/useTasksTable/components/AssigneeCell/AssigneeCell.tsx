import { Trans, useLingui } from "@lingui/react/macro";
import { Avatar } from "@superset/ui/atoms/Avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import type { CellContext } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { HiOutlineUserCircle } from "react-icons/hi2";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useOptimisticActions } from "renderer/routes/_authenticated/hooks/useOptimisticActions";
import type { TaskWithStatus } from "../../useTasksTable";

interface AssigneeCellProps {
	info: CellContext<TaskWithStatus, string | null>;
}

export function AssigneeCell({ info }: AssigneeCellProps) {
	const { t } = useLingui();
	const { tasks: taskActions } = useOptimisticActions();
	const [open, setOpen] = useState(false);

	const task = info.row.original;
	const assigneeId = info.getValue();

	const { data: members, isLoading: isLoadingMembers } =
		cloudTrpc.organization.listMembers.useQuery(undefined, { enabled: open });

	const users = useMemo(
		() => (members ?? []).map((member) => member.user),
		[members],
	);

	const handleSelectUser = (userId: string | null) => {
		if (userId === assigneeId && !task.assigneeExternalId) {
			setOpen(false);
			return;
		}

		const transaction = taskActions.updateAssignee(task.id, userId);
		if (transaction) {
			setOpen(false);
		}
	};

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="cursor-pointer"
					onClick={(e) => e.stopPropagation()}
				>
					{task.assignee ? (
						<Avatar
							size="xs"
							fullName={task.assignee.name}
							image={task.assignee.image}
						/>
					) : task.assigneeExternalId ? (
						<Avatar
							size="xs"
							fullName={
								task.assigneeDisplayName ||
								t({
									message: "External",
								})
							}
							image={task.assigneeAvatarUrl}
						/>
					) : (
						<HiOutlineUserCircle className="size-5 text-muted-foreground" />
					)}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="w-56"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="max-h-64 overflow-y-auto">
					<DropdownMenuItem
						onSelect={() => handleSelectUser(null)}
						className="flex items-center gap-2"
					>
						<HiOutlineUserCircle className="size-5 text-muted-foreground shrink-0" />
						<span className="text-sm">
							<Trans>No assignee</Trans>
						</span>
						{!assigneeId && !task.assigneeExternalId && (
							<span className="ml-auto text-xs text-muted-foreground">✓</span>
						)}
					</DropdownMenuItem>
					{isLoadingMembers && (
						<div className="px-2 py-1.5 text-sm text-muted-foreground">
							<Trans>Loading members...</Trans>
						</div>
					)}
					{users.map((user) => (
						<DropdownMenuItem
							key={user.id}
							onSelect={() => handleSelectUser(user.id)}
							className="flex items-center gap-2"
						>
							<Avatar size="xs" fullName={user.name} image={user.image} />
							<div className="flex flex-col">
								<span className="text-sm">{user.name}</span>
								<span className="text-xs text-muted-foreground">
									{user.email}
								</span>
							</div>
							{user.id === assigneeId && (
								<span className="ml-auto text-xs text-muted-foreground">✓</span>
							)}
						</DropdownMenuItem>
					))}
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

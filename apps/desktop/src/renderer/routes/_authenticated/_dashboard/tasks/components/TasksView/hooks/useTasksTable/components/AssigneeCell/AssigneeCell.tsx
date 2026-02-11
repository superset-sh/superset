import { Avatar } from "@superset/ui/atoms/Avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useLiveQuery } from "@tanstack/react-db";
import type { CellContext } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { HiOutlineUserCircle } from "react-icons/hi2";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { TaskWithStatus } from "../../useTasksTable";

interface AssigneeCellProps {
	info: CellContext<TaskWithStatus, string | null>;
}

export function AssigneeCell({ info }: AssigneeCellProps) {
	const collections = useCollections();
	const [open, setOpen] = useState(false);

	const task = info.row.original;
	const assigneeId = info.getValue();

	const { data: allUsers } = useLiveQuery(
		(q) => q.from({ users: collections.users }),
		[collections],
	);

	const users = useMemo(() => allUsers || [], [allUsers]);

	const handleSelectUser = (userId: string | null) => {
		if (userId === assigneeId) {
			setOpen(false);
			return;
		}

		setOpen(false);

		collections.tasks.update(task.id, (draft) => {
			draft.assigneeId = userId;
		});
	};

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<button type="button" className="cursor-pointer">
					{task.assignee ? (
						<Avatar
							size="xs"
							fullName={task.assignee.name}
							image={task.assignee.image}
						/>
					) : (
						<HiOutlineUserCircle className="size-5 text-muted-foreground" />
					)}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-56">
				<div className="max-h-64 overflow-y-auto">
					<DropdownMenuItem
						onSelect={() => handleSelectUser(null)}
						className="flex items-center gap-2"
					>
						<HiOutlineUserCircle className="size-5 text-muted-foreground shrink-0" />
						<span className="text-sm">No assignee</span>
						{!assigneeId && (
							<span className="ml-auto text-xs text-muted-foreground">✓</span>
						)}
					</DropdownMenuItem>
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

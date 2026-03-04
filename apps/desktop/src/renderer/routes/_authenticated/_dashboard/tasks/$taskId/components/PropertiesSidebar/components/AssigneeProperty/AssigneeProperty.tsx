import { Avatar } from "@superset/ui/atoms/Avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo, useState } from "react";
import { HiOutlineUserCircle } from "react-icons/hi2";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { TaskWithStatus } from "../../../../../components/TasksView/hooks/useTasksTable";

interface AssigneePropertyProps {
	task: TaskWithStatus;
}

export function AssigneeProperty({ task }: AssigneePropertyProps) {
	const collections = useCollections();
	const [open, setOpen] = useState(false);

	const { data: allUsers } = useLiveQuery(
		(q) => q.from({ users: collections.users }),
		[collections],
	);

	const users = useMemo(() => allUsers || [], [allUsers]);

	const handleSelectUser = (userId: string | null) => {
		if (userId === task.assigneeId) {
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
				<button
					type="button"
					className="flex items-center gap-2 hover:bg-muted/50 rounded px-1 py-0.5 -mx-1 transition-colors w-full"
				>
					{task.assignee ? (
						<>
							{task.assignee.image ? (
								<img
									src={task.assignee.image}
									alt=""
									className="w-5 h-5 rounded-full"
								/>
							) : (
								<div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs">
									{task.assignee.name?.charAt(0).toUpperCase() ?? "?"}
								</div>
							)}
							<span className="text-sm">{task.assignee.name}</span>
						</>
					) : (
						<>
							<HiOutlineUserCircle className="w-5 h-5 text-muted-foreground" />
							<span className="text-sm text-muted-foreground">Unassigned</span>
						</>
					)}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-56">
				<div className="max-h-64 overflow-y-auto">
					<DropdownMenuItem
						onSelect={() => handleSelectUser(null)}
						className="flex items-center gap-2"
					>
						<HiOutlineUserCircle className="w-5 h-5 text-muted-foreground shrink-0" />
						<span className="text-sm">No assignee</span>
						{!task.assigneeId && (
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
							{user.id === task.assigneeId && (
								<span className="ml-auto text-xs text-muted-foreground">✓</span>
							)}
						</DropdownMenuItem>
					))}
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

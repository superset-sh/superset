import { useState, useMemo } from "react";
import type { CellContext } from "@tanstack/react-table";
import { useLiveQuery } from "@tanstack/react-db";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/atoms/Avatar";
import { HiOutlineUserCircle } from "react-icons/hi2";
import { useCollections } from "renderer/contexts/CollectionsProvider";
import type { TaskWithStatus } from "../../hooks/useTasksTable";

interface AssigneeCellProps {
	info: CellContext<TaskWithStatus, string | null>;
}

export function AssigneeCell({ info }: AssigneeCellProps) {
	const collections = useCollections();
	const [open, setOpen] = useState(false);

	const task = info.row.original;
	const assigneeId = info.getValue();

	// All users for dropdown
	const { data: allUsers } = useLiveQuery(
		(q) => q.from({ users: collections.users }),
		[collections],
	);

	const users = useMemo(() => allUsers || [], [allUsers]);
	// Use pre-loaded assignee from joined query (eliminates delay)
	const currentAssignee = task.assignee;

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

	const getInitials = (name: string) => {
		return name
			.split(" ")
			.map((n) => n[0])
			.join("")
			.toUpperCase()
			.slice(0, 2);
	};

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<button className="cursor-pointer">
					{currentAssignee ? (
						<Avatar size="xs">
							{currentAssignee.image && (
								<AvatarImage src={currentAssignee.image} />
							)}
							<AvatarFallback size="xs">
								{getInitials(currentAssignee.name)}
							</AvatarFallback>
						</Avatar>
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
						<HiOutlineUserCircle className="size-5 text-muted-foreground flex-shrink-0" />
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
							<Avatar size="xs">
								{user.image && <AvatarImage src={user.image} />}
								<AvatarFallback size="xs">
									{getInitials(user.name)}
								</AvatarFallback>
							</Avatar>
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

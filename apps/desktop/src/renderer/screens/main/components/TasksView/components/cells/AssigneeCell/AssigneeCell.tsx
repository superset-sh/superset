import { useState, useMemo } from "react";
import type { CellContext } from "@tanstack/react-table";
import type { SelectTask } from "@superset/db/schema";
import { useLiveQuery } from "@tanstack/react-db";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { Button } from "@superset/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { useCollections } from "renderer/contexts/CollectionsProvider";

interface AssigneeCellProps {
	info: CellContext<SelectTask, string | null>;
}

export function AssigneeCell({ info }: AssigneeCellProps) {
	const collections = useCollections();
	const [open, setOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");

	const task = info.row.original;
	const assigneeId = info.getValue();

	// Lazy load users only when dropdown opens
	const { data: allUsers } = useLiveQuery(
		(q) => (open ? q.from({ users: collections.users }) : null),
		[collections, open],
	);

	const users = useMemo(() => allUsers || [], [allUsers]);

	// Find current assignee
	const currentAssignee = useMemo(() => {
		if (!assigneeId) return null;
		return users.find((u) => u.id === assigneeId);
	}, [assigneeId, users]);

	// Filter users based on search query
	const filteredUsers = useMemo(() => {
		const query = searchQuery.toLowerCase();
		return users.filter(
			(user) =>
				user.name.toLowerCase().includes(query) ||
				user.email.toLowerCase().includes(query),
		);
	}, [searchQuery, users]);

	const handleSelectUser = async (userId: string | null) => {
		if (userId === assigneeId) {
			setOpen(false);
			return;
		}

		try {
			await collections.tasks.update(task.id, (draft) => {
				draft.assigneeId = userId;
			});
			setOpen(false);
			setSearchQuery("");
		} catch (error) {
			console.error("[AssigneeCell] Failed to update assignee:", error);
		}
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
				<Button variant="ghost" size="sm" className="h-6 px-2 hover:bg-accent">
					{currentAssignee ? (
						<div className="flex items-center gap-2">
							<Avatar className="h-4 w-4">
								{currentAssignee.image && (
									<AvatarImage src={currentAssignee.image} />
								)}
								<AvatarFallback className="text-xs">
									{getInitials(currentAssignee.name)}
								</AvatarFallback>
							</Avatar>
							<span className="text-xs">{currentAssignee.name}</span>
						</div>
					) : (
						<span className="text-xs text-muted-foreground">Unassigned</span>
					)}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-56">
				<div className="p-2">
					<Input
						placeholder="Search users..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="h-8"
						autoFocus
					/>
				</div>
				<DropdownMenuSeparator />
				<div className="max-h-64 overflow-y-auto">
					<DropdownMenuItem
						onSelect={() => handleSelectUser(null)}
						className="flex items-center gap-2"
					>
						<div className="h-4 w-4 rounded-full bg-muted" />
						<span className="text-sm">Unassigned</span>
						{!assigneeId && (
							<span className="ml-auto text-xs text-muted-foreground">✓</span>
						)}
					</DropdownMenuItem>
					{filteredUsers.map((user) => (
						<DropdownMenuItem
							key={user.id}
							onSelect={() => handleSelectUser(user.id)}
							className="flex items-center gap-2"
						>
							<Avatar className="h-4 w-4">
								{user.image && <AvatarImage src={user.image} />}
								<AvatarFallback className="text-xs">
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
								<span className="ml-auto text-xs text-muted-foreground">
									✓
								</span>
							)}
						</DropdownMenuItem>
					))}
					{filteredUsers.length === 0 && searchQuery && (
						<div className="p-2 text-sm text-muted-foreground text-center">
							No users found
						</div>
					)}
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

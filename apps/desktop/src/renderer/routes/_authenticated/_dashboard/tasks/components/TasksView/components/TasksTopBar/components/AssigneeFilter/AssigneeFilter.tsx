import type { SelectUser } from "@superset/db/schema";
import { Avatar } from "@superset/ui/atoms/Avatar";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo, useState } from "react";
import { HiChevronDown, HiOutlineUserCircle } from "react-icons/hi2";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

interface AssigneeFilterProps {
	value: string | null;
	onChange: (value: string | null) => void;
}

export function AssigneeFilter({ value, onChange }: AssigneeFilterProps) {
	const collections = useCollections();
	const [open, setOpen] = useState(false);

	const { data: allUsers } = useLiveQuery(
		(q) => q.from({ users: collections.users }),
		[collections],
	);

	const users = useMemo(() => allUsers || [], [allUsers]);

	const { data: allTasks } = useLiveQuery(
		(q) => q.from({ tasks: collections.tasks }),
		[collections],
	);

	const externalAssignees = useMemo(() => {
		if (!allTasks) return [];
		const seen = new Map<
			string,
			{ id: string; name: string | null; avatar: string | null }
		>();
		for (const t of allTasks) {
			if (t.assigneeExternalId && !seen.has(t.assigneeExternalId)) {
				seen.set(t.assigneeExternalId, {
					id: t.assigneeExternalId,
					name: t.assigneeDisplayName,
					avatar: t.assigneeAvatarUrl,
				});
			}
		}
		return [...seen.values()];
	}, [allTasks]);

	const selectedUser = useMemo(() => {
		if (value === null) return null;
		if (value === "unassigned") return { id: "unassigned", name: "Unassigned" };
		if (value.startsWith("ext:")) {
			const extId = value.slice(4);
			const ext = externalAssignees.find((e) => e.id === extId);
			return ext
				? { id: value, name: ext.name || "External", image: ext.avatar }
				: null;
		}
		return users.find((u) => u.id === value) || null;
	}, [value, users, externalAssignees]);

	const handleSelect = (userId: string | null) => {
		onChange(userId);
		setOpen(false);
	};

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
				>
					{selectedUser ? (
						<>
							{selectedUser.id === "unassigned" ? (
								<HiOutlineUserCircle className="size-4" />
							) : (
								<Avatar
									size="xs"
									fullName={(selectedUser as SelectUser).name}
									image={(selectedUser as SelectUser).image}
								/>
							)}
							<span className="text-sm">{selectedUser.name}</span>
						</>
					) : (
						<>
							<HiOutlineUserCircle className="size-4" />
							<span className="text-sm">Assignee</span>
						</>
					)}
					<HiChevronDown className="size-3" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-56">
				<div className="max-h-64 overflow-y-auto">
					<DropdownMenuItem
						onSelect={() => handleSelect(null)}
						className="flex items-center gap-2"
					>
						<span className="text-sm">All assignees</span>
						{value === null && (
							<span className="ml-auto text-xs text-muted-foreground">✓</span>
						)}
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onSelect={() => handleSelect("unassigned")}
						className="flex items-center gap-2"
					>
						<HiOutlineUserCircle className="size-5 text-muted-foreground shrink-0" />
						<span className="text-sm">Unassigned</span>
						{value === "unassigned" && (
							<span className="ml-auto text-xs text-muted-foreground">✓</span>
						)}
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					{users.map((user) => (
						<DropdownMenuItem
							key={user.id}
							onSelect={() => handleSelect(user.id)}
							className="flex items-center gap-2"
						>
							<Avatar size="xs" fullName={user.name} image={user.image} />
							<div className="flex flex-col">
								<span className="text-sm">{user.name}</span>
								<span className="text-xs text-muted-foreground">
									{user.email}
								</span>
							</div>
							{user.id === value && (
								<span className="ml-auto text-xs text-muted-foreground">✓</span>
							)}
						</DropdownMenuItem>
					))}
					{externalAssignees.length > 0 && (
						<>
							<DropdownMenuSeparator />
							<div className="px-2 py-1 text-xs text-muted-foreground font-medium">
								External
							</div>
							{externalAssignees.map((ext) => (
								<DropdownMenuItem
									key={ext.id}
									onSelect={() => handleSelect(`ext:${ext.id}`)}
									className="flex items-center gap-2"
								>
									<Avatar
										size="xs"
										fullName={ext.name || "External"}
										image={ext.avatar}
									/>
									<span className="text-sm text-muted-foreground">
										{ext.name || "External"}
									</span>
									{value === `ext:${ext.id}` && (
										<span className="ml-auto text-xs text-muted-foreground">
											✓
										</span>
									)}
								</DropdownMenuItem>
							))}
						</>
					)}
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

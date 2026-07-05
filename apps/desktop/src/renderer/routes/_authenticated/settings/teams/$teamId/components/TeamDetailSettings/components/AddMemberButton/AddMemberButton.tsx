import { Avatar } from "@superset/ui/atoms/Avatar";
import { Button } from "@superset/ui/button";
import { Checkbox } from "@superset/ui/checkbox";
import { Input } from "@superset/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { toast } from "@superset/ui/sonner";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { HiOutlinePaperAirplane, HiOutlinePlus } from "react-icons/hi2";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

interface OrgUser {
	id: string;
	name: string | null;
	email: string;
	image: string | null;
}

interface AddMemberButtonProps {
	teamId: string;
	currentUserId: string | undefined;
	currentMemberUserIds: Set<string>;
	orgUsers: OrgUser[];
}

export function AddMemberButton({
	teamId,
	currentUserId,
	currentMemberUserIds,
	orgUsers,
}: AddMemberButtonProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [pendingUserId, setPendingUserId] = useState<string | null>(null);

	// Snapshot of who was a member when the popover opened. Sort against this
	// so toggling a checkbox doesn't reorder the row under the cursor.
	const [snapshot, setSnapshot] = useState<Set<string>>(
		() => new Set(currentMemberUserIds),
	);

	function handleOpenChange(open: boolean) {
		setIsOpen(open);
		if (open) {
			setSnapshot(new Set(currentMemberUserIds));
			setQuery("");
		}
	}

	const sortedUsers = useMemo(() => {
		const q = query.trim().toLowerCase();
		// Self isn't toggled from the dropdown — they manage their own
		// membership via the danger zone "Leave team" affordance.
		const filtered = orgUsers
			.filter((u) => u.id !== currentUserId)
			.filter((u) => {
				if (!q) return true;
				return (
					(u.name ?? "").toLowerCase().includes(q) ||
					u.email.toLowerCase().includes(q)
				);
			});
		filtered.sort((a, b) => {
			const aOn = snapshot.has(a.id) ? 0 : 1;
			const bOn = snapshot.has(b.id) ? 0 : 1;
			if (aOn !== bOn) return aOn - bOn;
			return (a.name ?? a.email).localeCompare(b.name ?? b.email);
		});
		return filtered;
	}, [orgUsers, snapshot, currentUserId, query]);

	async function toggleMembership(user: OrgUser, isCurrentlyMember: boolean) {
		setPendingUserId(user.id);
		try {
			if (isCurrentlyMember) {
				await apiTrpcClient.team.removeMember.mutate({
					teamId,
					userId: user.id,
				});
			} else {
				await apiTrpcClient.team.addMember.mutate({
					teamId,
					userId: user.id,
				});
			}
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: isCurrentlyMember
						? "Failed to remove member"
						: "Failed to add member",
			);
		} finally {
			setPendingUserId(null);
		}
	}

	return (
		<Popover open={isOpen} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<Button size="sm">
					<HiOutlinePlus className="h-4 w-4 mr-1" />
					Add member
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-72 p-0">
				<div className="p-2 border-b">
					<Input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Add team member..."
						className="h-8"
						autoFocus
					/>
				</div>
				<div className="max-h-64 overflow-auto p-1">
					{sortedUsers.length === 0 ? (
						<div className="text-center py-6 text-xs text-muted-foreground">
							No matching org members.
						</div>
					) : (
						sortedUsers.map((user) => {
							const isMember = currentMemberUserIds.has(user.id);
							const isPending = pendingUserId === user.id;
							return (
								<button
									type="button"
									key={user.id}
									disabled={isPending}
									onClick={() => toggleMembership(user, isMember)}
									className="flex items-center gap-2.5 w-full px-2 py-1.5 rounded-md text-left text-sm hover:bg-accent disabled:opacity-60 disabled:cursor-not-allowed"
								>
									<Checkbox checked={isMember} aria-hidden tabIndex={-1} />
									<Avatar
										size="sm"
										fullName={user.name ?? ""}
										image={user.image}
									/>
									<span className="flex-1 truncate font-medium">
										{user.name || user.email}
									</span>
								</button>
							);
						})
					)}
				</div>
				<div className="border-t p-1">
					<Link
						to="/settings/organization"
						onClick={() => setIsOpen(false)}
						className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
					>
						<HiOutlinePaperAirplane className="h-4 w-4" />
						Invite people...
					</Link>
				</div>
			</PopoverContent>
		</Popover>
	);
}

import { authClient } from "@superset/auth/client";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { useLiveQuery } from "@tanstack/react-db";
import { useState } from "react";
import { HiEllipsisVertical, HiOutlineTrash } from "react-icons/hi2";
import { useAuth } from "renderer/contexts/AuthProvider";
import { useCollections } from "renderer/contexts/CollectionsProvider";
import { InviteMemberButton } from "./components/InviteMemberButton";

interface MemberDetails {
	memberId: string;
	userId: string;
	name: string | null;
	email: string;
	image: string | null;
	role: string;
	joinedAt: string;
	organizationId: string;
}

interface MemberActionsProps {
	member: MemberDetails;
	isCurrentUser: boolean;
	canRemove: boolean;
}

function MemberActions({
	member,
	isCurrentUser,
	canRemove,
}: MemberActionsProps) {
	const [showRemoveDialog, setShowRemoveDialog] = useState(false);
	const [isRemoving, setIsRemoving] = useState(false);

	const handleRemove = async () => {
		setIsRemoving(true);
		try {
			if (isCurrentUser) {
				// User is leaving their own organization
				await authClient.organization.leave({
					organizationId: member.organizationId,
				});
				toast.success("Left organization");
			} else {
				// Admin is removing another member
				await authClient.organization.removeMember({
					organizationId: member.organizationId,
					memberIdOrEmail: member.userId,
				});
				toast.success("Member removed");
			}
			setShowRemoveDialog(false);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: `Failed to ${isCurrentUser ? "leave" : "remove member from"} organization`,
			);
		} finally {
			setIsRemoving(false);
		}
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="icon" className="h-8 w-8">
						<HiEllipsisVertical className="h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					{isCurrentUser ? (
						<DropdownMenuItem
							className="text-destructive gap-2"
							onSelect={() => setShowRemoveDialog(true)}
						>
							<HiOutlineTrash className="h-4 w-4" />
							<span>Leave organization...</span>
						</DropdownMenuItem>
					) : canRemove ? (
						<DropdownMenuItem
							className="text-destructive gap-2"
							onSelect={() => setShowRemoveDialog(true)}
						>
							<HiOutlineTrash className="h-4 w-4" />
							<span>Remove member</span>
						</DropdownMenuItem>
					) : null}
				</DropdownMenuContent>
			</DropdownMenu>

			<Dialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{isCurrentUser ? "Leave organization?" : "Remove team member?"}
						</DialogTitle>
						<DialogDescription>
							{isCurrentUser ? (
								<>
									Are you sure you want to leave this organization? You will
									lose access immediately.
								</>
							) : (
								<>
									Are you sure you want to remove <strong>{member.name}</strong>{" "}
									({member.email}) from the organization? They will lose access
									immediately.
								</>
							)}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setShowRemoveDialog(false)}
							disabled={isRemoving}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={handleRemove}
							disabled={isRemoving}
						>
							{isRemoving
								? isCurrentUser
									? "Leaving..."
									: "Removing..."
								: isCurrentUser
									? "Leave Organization"
									: "Remove Member"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

export function TeamSettings() {
	const { session } = useAuth();
	const collections = useCollections();

	const { data: membersData, isLoading: isLoadingMembers } = useLiveQuery(
		(q) => q.from({ members: collections.members }),
		[collections],
	);

	const { data: usersData, isLoading: isLoadingUsers } = useLiveQuery(
		(q) => q.from({ users: collections.users }),
		[collections],
	);

	const isLoading = isLoadingMembers || isLoadingUsers;

	// Join members with users and create member details
	const memberDetails =
		membersData && usersData
			? membersData.map((member) => {
					const user = usersData.find((u) => u.id === member.userId);
					return {
						memberId: member.id,
						userId: member.userId,
						name: user?.name ?? null,
						email: user?.email ?? "",
						image: user?.image ?? null,
						role: member.role,
						joinedAt:
							member.createdAt instanceof Date
								? member.createdAt.toISOString()
								: member.createdAt,
						organizationId: member.organizationId,
					};
				})
			: [];

	// Sort by role (owner first) then by joinedAt
	const members = memberDetails.slice().sort((a, b) => {
		// Owners first
		if (a.role === "owner" && b.role !== "owner") return -1;
		if (a.role !== "owner" && b.role === "owner") return 1;
		// Then by join date
		return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
	});

	const currentUserId = session?.user?.id;
	const currentMember = members.find((m) => m.userId === currentUserId);
	const isOwner = currentMember?.role === "owner";

	const formatDate = (dateString: string) => {
		const date = new Date(dateString);
		return date.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
		});
	};

	return (
		<div className="flex-1 flex flex-col min-h-0">
			<div className="p-8 border-b">
				<div className="max-w-5xl">
					<h2 className="text-2xl font-semibold">Team</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Manage members in your organization
					</p>
				</div>
			</div>

			<div className="flex-1 overflow-auto">
				<div className="p-8">
					<div className="max-w-5xl space-y-4">
						<div className="flex justify-end">
							<InviteMemberButton />
						</div>

						{isLoading ? (
							<div className="space-y-2 border rounded-lg">
								{[1, 2, 3].map((i) => (
									<div key={i} className="flex items-center gap-4 p-4">
										<Skeleton className="h-8 w-8 rounded-full" />
										<div className="flex-1 space-y-2">
											<Skeleton className="h-4 w-48" />
											<Skeleton className="h-3 w-32" />
										</div>
										<Skeleton className="h-4 w-16" />
										<Skeleton className="h-4 w-20" />
									</div>
								))}
							</div>
						) : members.length === 0 ? (
							<div className="text-center py-12 text-muted-foreground border rounded-lg">
								No team members yet
							</div>
						) : (
							<div className="border rounded-lg">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Name</TableHead>
											<TableHead>Email</TableHead>
											<TableHead>Role</TableHead>
											<TableHead>Joined</TableHead>
											<TableHead className="w-[50px]" />
										</TableRow>
									</TableHeader>
									<TableBody>
										{members.map((member) => {
											const initials = member.name
												?.split(" ")
												.map((n) => n[0])
												.join("")
												.toUpperCase()
												.slice(0, 2);
											const isCurrentUserRow = member.userId === currentUserId;

											return (
												<TableRow key={member.memberId}>
													<TableCell>
														<div className="flex items-center gap-3">
															<Avatar className="h-8 w-8">
																<AvatarImage src={member.image ?? undefined} />
																<AvatarFallback className="text-xs">
																	{initials || "?"}
																</AvatarFallback>
															</Avatar>
															<div className="flex items-center gap-2">
																<span className="font-medium">
																	{member.name || "Unknown"}
																</span>
																{isCurrentUserRow && (
																	<Badge
																		variant="secondary"
																		className="text-xs"
																	>
																		You
																	</Badge>
																)}
															</div>
														</div>
													</TableCell>
													<TableCell className="text-muted-foreground">
														{member.email}
													</TableCell>
													<TableCell>
														<Badge
															variant={
																member.role === "owner" ? "default" : "outline"
															}
															className="text-xs capitalize"
														>
															{member.role}
														</Badge>
													</TableCell>
													<TableCell className="text-muted-foreground">
														{formatDate(member.joinedAt)}
													</TableCell>
													<TableCell>
														<MemberActions
															member={member}
															isCurrentUser={isCurrentUserRow}
															canRemove={
																isOwner &&
																!isCurrentUserRow &&
																member.role !== "owner"
															}
														/>
													</TableCell>
												</TableRow>
											);
										})}
									</TableBody>
								</Table>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

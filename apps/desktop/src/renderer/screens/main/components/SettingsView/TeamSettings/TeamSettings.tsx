import { getInitials } from "@superset/shared/names";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { Badge } from "@superset/ui/badge";
import { Skeleton } from "@superset/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { useLiveQuery } from "@tanstack/react-db";
import { useAuth } from "renderer/contexts/AuthProvider";
import { useCollections } from "renderer/contexts/CollectionsProvider";
import { InviteMemberButton } from "./components/InviteMemberButton";
import { MemberActions } from "./components/MemberActions";

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
											const initials = getInitials(member.name, member.email);
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

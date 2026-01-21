import {
	canRemoveMember,
	getRoleSortPriority,
	type OrganizationRole,
} from "@superset/shared/auth";
import { Avatar } from "@superset/ui/atoms/Avatar";
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
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import type { TeamMember } from "../../types";
import { InviteMemberButton } from "./components/InviteMemberButton";
import { MemberActions } from "./components/MemberActions";

interface MembersSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function MembersSettings({ visibleItems }: MembersSettingsProps) {
	const { data: session } = authClient.useSession();
	const collections = useCollections();
	const activeOrganizationId = session?.session?.activeOrganizationId;
	const { data: activeOrg } = authClient.useActiveOrganization();

	const showMembersList = isItemVisible(
		SETTING_ITEM_ID.MEMBERS_LIST,
		visibleItems,
	);
	const showInvite = isItemVisible(
		SETTING_ITEM_ID.MEMBERS_INVITE,
		visibleItems,
	);

	const { data: membersData, isLoading } = useLiveQuery(
		(q) =>
			q
				.from({ members: collections.members })
				.innerJoin({ users: collections.users }, ({ members, users }) =>
					eq(members.userId, users.id),
				)
				.select(({ members, users }) => ({
					...users,
					...members,
					memberId: members.id,
				}))
				.orderBy(({ members }) => members.role, "asc")
				.orderBy(({ members }) => members.createdAt, "asc"),
		[collections, activeOrganizationId],
	);

	// Sort by role priority (owner > admin > member), then by join date
	// Cast roles to OrganizationRole since database stores them as strings
	const members: TeamMember[] = (membersData ?? [])
		.map((m) => ({
			...m,
			role: m.role as OrganizationRole,
		}))
		.sort((a, b) => {
			const priorityDiff =
				getRoleSortPriority(a.role) - getRoleSortPriority(b.role);
			if (priorityDiff !== 0) return priorityDiff;
			return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
		});
	const ownerCount = members.filter((m) => m.role === "owner").length;

	const currentUserId = session?.user?.id;
	const currentMember = activeOrg?.members?.find(
		(m) => m.userId === currentUserId,
	);
	const currentUserRole = currentMember?.role as OrganizationRole;

	const formatDate = (date: Date | string) => {
		const d = date instanceof Date ? date : new Date(date);
		return d.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
		});
	};

	return (
		<div className="flex-1 flex flex-col min-h-0">
			<div className="p-8">
				<div className="max-w-5xl">
					<h2 className="text-2xl font-semibold">Members</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Invite and manage members, assign roles, and control permissions
					</p>
				</div>
			</div>

			<div className="flex-1 overflow-auto">
				<div className="p-8">
					<div className="max-w-5xl space-y-4">
						{showInvite && (
							<div className="flex justify-end">
								<InviteMemberButton />
							</div>
						)}

						{showMembersList &&
							(isLoading ? (
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
									No members yet
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
												const isCurrentUserRow =
													member.userId === currentUserId;

												return (
													<TableRow key={member.memberId}>
														<TableCell>
															<div className="flex items-center gap-3">
																<Avatar
																	size="md"
																	fullName={member.name}
																	image={member.image}
																/>
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
																	member.role === "owner"
																		? "default"
																		: "outline"
																}
																className="text-xs capitalize"
															>
																{member.role}
															</Badge>
														</TableCell>
														<TableCell className="text-muted-foreground">
															{formatDate(member.createdAt)}
														</TableCell>
														<TableCell>
															<MemberActions
																member={member}
																currentUserRole={currentUserRole}
																ownerCount={ownerCount}
																isCurrentUser={isCurrentUserRow}
																canRemove={canRemoveMember(
																	currentUserRole,
																	member.role as OrganizationRole,
																	isCurrentUserRow,
																	ownerCount,
																)}
															/>
														</TableCell>
													</TableRow>
												);
											})}
										</TableBody>
									</Table>
								</div>
							))}
					</div>
				</div>
			</div>
		</div>
	);
}

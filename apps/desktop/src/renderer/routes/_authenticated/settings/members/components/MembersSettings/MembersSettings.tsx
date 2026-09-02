import { Trans, useLingui } from "@lingui/react/macro";
import { formatDate as formatLocaleDate } from "@superset/i18n/format";
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
import { useMemo } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import type { TeamMember } from "../../types";
import { PendingInvitations } from "../PendingInvitations";
import { MemberActions } from "./components/MemberActions";

interface MembersSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function MembersSettings({ visibleItems }: MembersSettingsProps) {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const { data: session } = authClient.useSession();
	// Per-window org, not the shared session: the session holds one org for
	// the whole app, so a second window on another org would render this
	// window against the other one's organization.
	const activeOrganizationId = useActiveOrganizationId();

	const showMembersList = isItemVisible(
		SETTING_ITEM_ID.ORGANIZATION_MEMBERS_LIST,
		visibleItems,
	);

	const { data: membersData, isPending } =
		cloudTrpc.organization.listMembers.useQuery({ includeDeactivated: true });

	const { data: orgData } = cloudTrpc.organization.list.useQuery(undefined);
	const organization = orgData?.find((org) => org.id === activeOrganizationId);

	const members: TeamMember[] = useMemo(() => {
		if (!activeOrganizationId) return [];
		return (membersData ?? [])
			.map((m) => ({
				memberId: m.id,
				userId: m.userId,
				organizationId: activeOrganizationId,
				role: m.role as OrganizationRole,
				createdAt: m.createdAt,
				name: m.user.name,
				email: m.user.email,
				image: m.user.image,
				deletionRequestedAt: m.user.deletionRequestedAt,
			}))
			.sort((a, b) => {
				const priorityDiff =
					getRoleSortPriority(a.role) - getRoleSortPriority(b.role);
				if (priorityDiff !== 0) return priorityDiff;
				return (
					new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
				);
			});
	}, [membersData, activeOrganizationId]);
	const ownerCount = members.filter((m) => m.role === "owner").length;

	const currentUserId = session?.user?.id;
	const currentMember = members.find((m) => m.userId === currentUserId);
	const currentUserRole = currentMember?.role;

	const formatDate = (date: Date | string) => {
		const d = date instanceof Date ? date : new Date(date);
		return formatLocaleDate(d, {
			month: "short",
			day: "numeric",
		});
	};

	return (
		<div className="flex-1 flex flex-col min-h-0">
			<div className="p-8">
				<div className="max-w-5xl">
					<h2 className="text-2xl font-semibold">
						<Trans>Members</Trans>
					</h2>
					<p className="text-sm text-muted-foreground mt-1">
						<Trans>
							Invite and manage members, assign roles, and control permissions
						</Trans>
					</p>
				</div>
			</div>

			<div className="flex-1 overflow-auto">
				<div className="p-8 space-y-12">
					{currentUserRole && activeOrganizationId && organization?.name && (
						<div className="max-w-5xl">
							<PendingInvitations
								visibleItems={visibleItems}
								currentUserRole={currentUserRole}
								organizationId={activeOrganizationId}
								organizationName={organization.name}
							/>
						</div>
					)}

					<div className="max-w-5xl space-y-4">
						<h3 className="text-lg font-semibold">
							<HighlightText
								text={t({
									message: "Team Members",
								})}
								query={searchQuery}
							/>
						</h3>

						{showMembersList &&
							(isPending && members.length === 0 ? (
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
									<Trans>No members yet</Trans>
								</div>
							) : (
								<div className="border rounded-lg">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>
													<Trans>Name</Trans>
												</TableHead>
												<TableHead>
													<Trans>Email</Trans>
												</TableHead>
												<TableHead>
													<Trans>Role</Trans>
												</TableHead>
												<TableHead>
													<Trans>Joined</Trans>
												</TableHead>
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
																	<span
																		className={
																			member.deletionRequestedAt
																				? "font-medium text-muted-foreground"
																				: "font-medium"
																		}
																	>
																		{member.name ||
																			t({
																				message: "Unknown",
																				context: "person",
																			})}
																	</span>
																	{isCurrentUserRow && (
																		<Badge
																			variant="secondary"
																			className="text-xs"
																		>
																			<Trans>You</Trans>
																		</Badge>
																	)}
																	{member.deletionRequestedAt && (
																		<Badge
																			variant="outline"
																			className="text-xs text-muted-foreground"
																		>
																			<Trans>Deactivated</Trans>
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
															{currentUserRole && (
																<MemberActions
																	member={member}
																	currentUserRole={currentUserRole}
																	ownerCount={ownerCount}
																	isCurrentUser={isCurrentUserRow}
																	canRemove={canRemoveMember(
																		currentUserRole,
																		member.role,
																		isCurrentUserRow,
																		ownerCount,
																	)}
																/>
															)}
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

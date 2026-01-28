import type { OrganizationRole } from "@superset/shared/auth";
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
import { and, eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { InviteMemberButton } from "../MembersSettings/components/InviteMemberButton";
import { InvitationActions } from "./components/InvitationActions";

interface PendingInvitationsProps {
	visibleItems?: SettingItemId[] | null;
	currentUserRole: OrganizationRole;
	organizationId: string;
	organizationName: string;
}

export function PendingInvitations({
	visibleItems,
	currentUserRole,
	organizationId,
	organizationName,
}: PendingInvitationsProps) {
	const collections = useCollections();

	const shouldShowSection = isItemVisible(
		SETTING_ITEM_ID.ORGANIZATION_MEMBERS_PENDING_INVITATIONS,
		visibleItems,
	);

	const { data: invitationsData, isLoading } = useLiveQuery(
		(q) =>
			q
				.from({ invitations: collections.invitations })
				.leftJoin({ users: collections.users }, ({ invitations, users }) =>
					eq(invitations.inviterId, users.id),
				)
				.select(({ invitations, users }) => ({
					invitation: invitations,
					inviter: users,
				}))
				.where(({ invitations }) =>
					and(
						eq(invitations.organizationId, organizationId),
						eq(invitations.status, "pending"),
					),
				)
				.orderBy(({ invitations }) => invitations.createdAt, "desc"),
		[collections, organizationId],
	);

	const invitations = invitationsData ?? [];

	if (!shouldShowSection) {
		return null;
	}

	const formatDate = (date: Date | string) => {
		const d = date instanceof Date ? date : new Date(date);
		return d.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	};

	const showInvite = isItemVisible(
		SETTING_ITEM_ID.ORGANIZATION_MEMBERS_INVITE,
		visibleItems,
	);

	if (isLoading) {
		return (
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<h3 className="text-lg font-semibold">Pending Invitations</h3>
					{showInvite && (
						<InviteMemberButton
							currentUserRole={currentUserRole}
							organizationId={organizationId}
							organizationName={organizationName}
						/>
					)}
				</div>
				<div className="space-y-2 border rounded-lg">
					{[1, 2, 3].map((i) => (
						<div key={i} className="flex items-center gap-4 p-4">
							<div className="flex-1 space-y-2">
								<Skeleton className="h-4 w-48" />
								<Skeleton className="h-3 w-32" />
							</div>
							<Skeleton className="h-4 w-16" />
							<Skeleton className="h-4 w-20" />
						</div>
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h3 className="text-lg font-semibold">Pending Invitations</h3>
				{showInvite && (
					<InviteMemberButton
						currentUserRole={currentUserRole}
						organizationId={organizationId}
						organizationName={organizationName}
					/>
				)}
			</div>
			{invitations.length === 0 ? (
				<div className="text-center py-12 text-muted-foreground border rounded-lg">
					No pending invitations
				</div>
			) : (
				<div className="border rounded-lg">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Email</TableHead>
								<TableHead>Invited By</TableHead>
								<TableHead>Role</TableHead>
								<TableHead>Sent</TableHead>
								<TableHead className="w-[50px]" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{invitations.map(({ invitation, inviter }) => (
								<TableRow key={invitation.id}>
									<TableCell className="font-medium">
										{invitation.email}
									</TableCell>
									<TableCell className="text-muted-foreground">
										{inviter?.name || "Unknown"}
									</TableCell>
									<TableCell>
										<Badge variant="outline" className="text-xs capitalize">
											{invitation.role}
										</Badge>
									</TableCell>
									<TableCell className="text-muted-foreground">
										{formatDate(invitation.createdAt)}
									</TableCell>
									<TableCell>
										<InvitationActions invitation={invitation} />
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}
		</div>
	);
}

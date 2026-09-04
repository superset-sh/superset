import { Trans, useLingui } from "@lingui/react/macro";
import { formatDate as formatLocaleDate } from "@superset/i18n/format";
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
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
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
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();

	const shouldShowSection = isItemVisible(
		SETTING_ITEM_ID.ORGANIZATION_MEMBERS_PENDING_INVITATIONS,
		visibleItems,
	);

	const { data: invitationsData, isPending } =
		cloudTrpc.organization.listInvitations.useQuery(undefined);

	const invitations = invitationsData ?? [];

	if (!shouldShowSection) {
		return null;
	}

	const formatDate = (date: Date | string) => {
		const d = date instanceof Date ? date : new Date(date);
		return formatLocaleDate(d, {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	};

	const showInvite = isItemVisible(
		SETTING_ITEM_ID.ORGANIZATION_MEMBERS_INVITE,
		visibleItems,
	);

	if (isPending && invitations.length === 0) {
		return (
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<h3 className="text-lg font-semibold">
						<HighlightText
							text={t({
								message: "Pending Invitations",
							})}
							query={searchQuery}
						/>
					</h3>
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
				<h3 className="text-lg font-semibold">
					<HighlightText
						text={t({
							message: "Pending Invitations",
						})}
						query={searchQuery}
					/>
				</h3>
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
					<Trans>No pending invitations</Trans>
				</div>
			) : (
				<div className="border rounded-lg">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>
									<Trans>Email</Trans>
								</TableHead>
								<TableHead>
									<Trans>Invited By</Trans>
								</TableHead>
								<TableHead>
									<Trans>Role</Trans>
								</TableHead>
								<TableHead>
									<Trans>Sent</Trans>
								</TableHead>
								<TableHead className="w-[50px]" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{invitations.map((invitation) => (
								<TableRow key={invitation.id}>
									<TableCell className="font-medium">
										{invitation.email}
									</TableCell>
									<TableCell className="text-muted-foreground">
										{invitation.inviter?.name ||
											t({
												message: "Unknown",
												context: "person",
											})}
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

import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	getInvitableRoles,
	type OrganizationRole,
} from "@superset/shared/auth";
import { isPaidPlanTier } from "@superset/shared/billing";
import { COMPANY } from "@superset/shared/constants";
import {
	type InviteNewMode,
	type ShareAddRequest,
	type ShareGranteeRef,
	shareDirectory,
} from "@superset/shared/sharing";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useMemo } from "react";
import { Alert } from "react-native";
import { authClient, useSession } from "@/lib/auth/client";
import { openUrl } from "@/lib/open-url";
import { apiClient } from "@/lib/trpc/client";
import { billingSettingsUrl } from "@/lib/web-links";
import { useOrganizations } from "@/screens/(authenticated)/hooks/useOrganizations";
import { useOrgMembers } from "@/screens/(authenticated)/hooks/useOrgMembers";

/** Who the share sheet can find in the active organization, and whether new people can be invited. */
export function useShareDirectory() {
	const { t } = useLingui();
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;
	const members = useOrgMembers();
	const { activeOrganization } = useOrganizations();
	const teams = useQuery({
		queryKey: ["cloud", "organization", "listTeams", organizationId],
		enabled: organizationId !== null,
		queryFn: () => apiClient.organization.listTeams.query(),
		staleTime: 30_000,
	});

	const directory = useMemo(
		() => shareDirectory(members, teams.data),
		[members, teams.data],
	);
	const role = members.find((m) => m.userId === session?.user.id)?.role as
		| OrganizationRole
		| undefined;
	const inviteNew: InviteNewMode = !isPaidPlanTier(session?.session.plan)
		? "upgrade"
		: role && getInvitableRoles(role).includes("member")
			? "allowed"
			: "admins-only";

	/** Invites each email to the organization, reusing a pending invite, and returns the invitation ids. */
	const inviteEmails = async (emails: string[]): Promise<string[]> => {
		const ids: string[] = [];
		for (const email of emails) {
			const { data, error } = await authClient.organization.inviteMember({
				organizationId: organizationId ?? undefined,
				email,
				role: "member",
				resend: true,
			});
			if (error || !data) {
				throw new Error(error?.message ?? `Could not invite ${email}`);
			}
			ids.push(data.id);
		}
		return ids;
	};

	const organizationName = activeOrganization?.name ?? "";

	const onUpgrade = () =>
		Alert.alert(
			t({ message: "Invite people on a paid plan" }),
			t({
				message: `Adding people to ${organizationName} needs a paid plan. Your organization's plan is managed by its owner at ${COMPANY.DOMAIN}.`,
			}),
			[
				{ style: "cancel", text: t({ message: "Dismiss" }) },
				{
					onPress: () => openUrl(billingSettingsUrl(organizationId)),
					text: t({ message: `Manage on ${COMPANY.DOMAIN}` }),
				},
			],
		);

	/** Invites any new emails, then grants everyone access through `add`. Resolves false after showing the error. */
	const share = async (
		{ grantees, emails, role }: ShareAddRequest,
		add: (grantees: ShareGranteeRef[], role: string) => Promise<unknown>,
	) => {
		try {
			const invitationIds = await inviteEmails(emails);
			await add(
				[
					...grantees,
					...invitationIds.map(
						(invitationId): ShareGranteeRef => ({
							kind: "invitation",
							invitationId,
						}),
					),
				],
				role,
			);
			void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
			return true;
		} catch (error) {
			Alert.alert(errorMessage(error, t({ message: "Could not share" })));
			return false;
		}
	};

	return {
		currentUserId: session?.user.id,
		directory,
		organizationName,
		inviteNew,
		onUpgrade,
		share,
	};
}

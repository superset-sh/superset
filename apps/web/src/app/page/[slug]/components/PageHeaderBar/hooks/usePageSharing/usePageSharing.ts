"use client";

import { authClient } from "@superset/auth/client";
import {
	getInvitableRoles,
	type OrganizationRole,
} from "@superset/shared/auth";
import { resolveCurrentPlan } from "@superset/shared/billing";
import type { PageHeaderSharing } from "@superset/ui/page-comments";
import {
	type InviteNewMode,
	type ShareGranteeRef,
	shareDirectory,
} from "@superset/ui/share-access";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useTRPC } from "@/trpc/react";

/** The share popover's people and teams for one page, and how to change them. */
export function usePageSharing(pageId: string): PageHeaderSharing {
	const trpc = useTRPC();
	const router = useRouter();
	const queryClient = useQueryClient();
	const { data: session } = authClient.useSession();
	const activeOrganizationId = session?.session?.activeOrganizationId ?? null;

	const { data: sharing } = useQuery(
		trpc.page.sharing.get.queryOptions({ id: pageId }),
	);
	const { data: members } = useQuery(
		trpc.organization.listMembers.queryOptions({ includeDeactivated: false }),
	);
	const { data: teams } = useQuery(trpc.organization.listTeams.queryOptions());
	const { data: organizations } = useQuery(
		trpc.user.myOrganizations.queryOptions(),
	);
	const { data: activePlan } = useQuery(trpc.billing.activePlan.queryOptions());

	const add = useMutation(trpc.page.sharing.add.mutationOptions());
	const remove = useMutation(trpc.page.sharing.remove.mutationOptions());
	const setRole = useMutation(trpc.page.sharing.setRole.mutationOptions());
	const setOrganizationRole = useMutation(
		trpc.page.setOrganizationRole.mutationOptions(),
	);

	const directory = useMemo(
		() => shareDirectory(members, teams),
		[members, teams],
	);
	const role = members?.find((m) => m.userId === session?.user?.id)?.role as
		| OrganizationRole
		| undefined;
	const plan = resolveCurrentPlan({
		subscriptionPlan: activePlan?.plan,
		sessionPlan: session?.session?.plan,
		subscriptionsLoaded: activePlan !== undefined,
	});
	const inviteNew: InviteNewMode =
		activePlan !== undefined && plan === "free"
			? "upgrade"
			: role && getInvitableRoles(role).includes("member")
				? "allowed"
				: "admins-only";

	const refresh = () =>
		queryClient.invalidateQueries(
			trpc.page.sharing.get.queryFilter({ id: pageId }),
		);

	const inviteEmails = async (emails: string[]) => {
		const ids: string[] = [];
		for (const email of emails) {
			const { data, error } = await authClient.organization.inviteMember({
				organizationId: activeOrganizationId ?? undefined,
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

	const grantees = sharing?.grantees ?? [];

	return {
		grantees,
		organizationRole: sharing?.organizationRole ?? "comment",
		directory,
		organizationName:
			organizations?.find((org) => org.id === activeOrganizationId)?.name ?? "",
		inviteNew,
		onUpgrade: () => router.push("/settings/billing"),
		onAdd: async ({ grantees: picked, emails, role: shareRole }) => {
			const invitationIds = await inviteEmails(emails);
			await add.mutateAsync({
				id: pageId,
				role: shareRole === "view" ? "view" : "comment",
				grantees: [
					...picked,
					...invitationIds.map(
						(invitationId): ShareGranteeRef => ({
							kind: "invitation",
							invitationId,
						}),
					),
				],
			});
			await refresh();
		},
		onRemove: async (grantee) => {
			await remove.mutateAsync({ id: pageId, grantee });
			await refresh();
		},
		onSetRole: async (grantee, shareRole) => {
			await setRole.mutateAsync({ id: pageId, grantee, role: shareRole });
			await refresh();
		},
		onSetOrganizationRole: async (organizationRole) => {
			await setOrganizationRole.mutateAsync({
				id: pageId,
				role: organizationRole,
			});
			await refresh();
			router.refresh();
		},
		onResendInvite: async (invitationId) => {
			const invite = grantees.find(
				(g) => g.kind === "invitation" && g.invitationId === invitationId,
			);
			if (invite?.kind === "invitation") await inviteEmails([invite.email]);
		},
	};
}

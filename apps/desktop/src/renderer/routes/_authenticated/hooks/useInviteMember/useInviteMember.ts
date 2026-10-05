import { getInvitableRoles } from "@superset/shared/auth";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";
import { useInviteMemberDialogStore } from "renderer/stores/invite-member-dialog";
import { useOrganizationRole } from "../useOrganizationRole";

export function useInviteMember(): (() => void) | undefined {
	const { gateFeature } = usePaywall();
	const role = useOrganizationRole();
	const setDialogOpen = useInviteMemberDialogStore((state) => state.setOpen);

	if (role === null || getInvitableRoles(role).length === 0) {
		return undefined;
	}

	return () => {
		gateFeature(GATED_FEATURES.INVITE_MEMBERS, () => setDialogOpen(true));
	};
}

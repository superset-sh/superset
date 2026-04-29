import {
	getInvitableRoles,
	type OrganizationRole,
} from "@superset/shared/auth";
import { alert } from "@superset/ui/atoms/Alert";
import { Button } from "@superset/ui/button";
import { useLiveQuery } from "@tanstack/react-db";
import { format } from "date-fns";
import { useState } from "react";
import { HiOutlinePlus } from "react-icons/hi2";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { InviteMemberDialog } from "./components/InviteMemberDialog";

interface InviteMemberButtonProps {
	currentUserRole: OrganizationRole;
	organizationId: string;
	organizationName: string;
}

export function InviteMemberButton({
	currentUserRole,
	organizationId,
	organizationName,
}: InviteMemberButtonProps) {
	const [open, setOpen] = useState(false);
	const { gateFeature } = usePaywall();
	const collections = useCollections();

	const { data: subscriptionsData } = useLiveQuery(
		(q) => q.from({ subscriptions: collections.subscriptions }),
		[collections],
	);
	const trialingSub = subscriptionsData?.find(
		(s) => s.status === "trialing" && s.trialEnd != null,
	);

	const invitableRoles = getInvitableRoles(currentUserRole);

	// Hide button if user can't invite anyone
	if (invitableRoles.length === 0) {
		return null;
	}

	const handleClick = () => {
		gateFeature(GATED_FEATURES.INVITE_MEMBERS, () => {
			const description =
				trialingSub?.trialEnd != null
					? `Adding members will increase your subscription cost after your trial ends on ${format(
							new Date(trialingSub.trialEnd),
							"MMMM d, yyyy",
						)}.`
					: "Adding members will increase your subscription cost, prorated to your billing cycle.";

			alert({
				title: "This will affect your billing",
				description,
				actions: [
					{ label: "Cancel", variant: "outline", onClick: () => {} },
					{ label: "Continue", onClick: () => setOpen(true) },
				],
			});
		});
	};

	return (
		<>
			<Button onClick={handleClick} className="gap-2">
				<HiOutlinePlus className="h-4 w-4" />
				Invite Member
			</Button>

			<InviteMemberDialog
				open={open}
				onOpenChange={setOpen}
				organizationId={organizationId}
				organizationName={organizationName}
				invitableRoles={invitableRoles}
				currentUserRole={currentUserRole}
			/>
		</>
	);
}

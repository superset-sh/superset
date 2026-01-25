import {
	getInvitableRoles,
	type OrganizationRole,
} from "@superset/shared/auth";
import { alert } from "@superset/ui/atoms/Alert";
import { Button } from "@superset/ui/button";
import { useState } from "react";
import { HiOutlinePlus } from "react-icons/hi2";
import { InviteMemberDialog } from "./components/InviteMemberDialog";

interface InviteMemberButtonProps {
	currentUserRole: OrganizationRole;
	organizationId: string;
	organizationName: string;
	plan?: "free" | "pro" | "enterprise";
}

export function InviteMemberButton({
	currentUserRole,
	organizationId,
	organizationName,
	plan,
}: InviteMemberButtonProps) {
	const [open, setOpen] = useState(false);

	const invitableRoles = getInvitableRoles(currentUserRole);

	// Hide button if user can't invite anyone
	if (invitableRoles.length === 0) {
		return null;
	}

	const handleClick = () => {
		if (plan === "pro") {
			alert({
				title: "This will affect your billing",
				description:
					"Each member added will be billed at $20/month (prorated to your billing cycle).",
				confirmText: "Continue",
				cancelText: "Cancel",
				onConfirm: () => setOpen(true),
			});
		} else {
			setOpen(true);
		}
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

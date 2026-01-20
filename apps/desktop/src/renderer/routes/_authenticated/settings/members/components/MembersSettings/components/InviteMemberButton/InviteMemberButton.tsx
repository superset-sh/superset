import {
	getInvitableRoles,
	type OrganizationRole,
} from "@superset/shared/auth";
import { Button } from "@superset/ui/button";
import { useState } from "react";
import { HiOutlinePlus } from "react-icons/hi2";
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

	const invitableRoles = getInvitableRoles(currentUserRole);

	// Hide button if user can't invite anyone
	if (invitableRoles.length === 0) {
		return null;
	}

	return (
		<>
			<Button onClick={() => setOpen(true)} className="gap-2">
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

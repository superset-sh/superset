import {
	ORGANIZATION_ROLES,
	type OrganizationRole,
} from "@superset/shared/auth";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { authClient } from "renderer/lib/auth-client";
import { handleInviteMember } from "./utils/handleInviteMember";

interface InviteMemberDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	organizationName: string;
	invitableRoles: OrganizationRole[];
	currentUserRole: OrganizationRole;
}

export function InviteMemberDialog({
	open,
	onOpenChange,
	organizationId,
	organizationName,
	invitableRoles,
	currentUserRole,
}: InviteMemberDialogProps) {
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<OrganizationRole>("member");
	const [isInviting, setIsInviting] = useState(false);

	const handleInvite = async () => {
		setIsInviting(true);
		const success = await handleInviteMember(
			{ organizationId, email, role },
			{
				currentUserRole,
				inviteMember: (args) => authClient.organization.inviteMember(args),
				onSuccess: (message) => toast.success(message),
				onError: (message) => toast.error(message),
			},
		);
		setIsInviting(false);

		if (success) {
			setEmail("");
			setRole("member");
			onOpenChange(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Invite Member</DialogTitle>
					<DialogDescription>
						Send an invitation to join {organizationName}. Expires in 48 hours.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-4">
					<div className="space-y-2">
						<Label htmlFor="email">Email</Label>
						<Input
							id="email"
							type="email"
							placeholder="user@example.com"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && email && !isInviting) {
									handleInvite();
								}
							}}
							disabled={isInviting}
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="role">Role</Label>
						<Select
							value={role}
							onValueChange={(val) => setRole(val as OrganizationRole)}
						>
							<SelectTrigger id="role" disabled={isInviting}>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{invitableRoles.map((r) => (
									<SelectItem key={r} value={r}>
										{ORGANIZATION_ROLES[r].name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isInviting}
					>
						Cancel
					</Button>
					<Button onClick={handleInvite} disabled={isInviting || !email}>
						{isInviting ? "Sending..." : "Send Invitation"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

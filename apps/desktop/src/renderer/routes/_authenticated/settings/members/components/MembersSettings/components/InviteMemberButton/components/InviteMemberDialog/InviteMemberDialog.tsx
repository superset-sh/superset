import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	canInvite,
	type OrganizationRole,
	organizationRoleName,
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
import { cloudTrpc } from "renderer/lib/cloud-trpc";

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
	const { t } = useLingui();
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<OrganizationRole>("member");
	const [isInviting, setIsInviting] = useState(false);
	const utils = cloudTrpc.useUtils();

	const handleInvite = async () => {
		if (!canInvite(currentUserRole, role)) {
			const roleName = organizationRoleName(role);
			toast.error(
				t({
					message: `Cannot invite users as ${roleName}`,
				}),
			);
			return;
		}

		setIsInviting(true);
		try {
			await authClient.organization.inviteMember({
				organizationId,
				email,
				role,
			});

			await utils.organization.listInvitations.invalidate();
			toast.success(
				t({
					message: `Invitation sent to ${email}`,
				}),
			);
			setEmail("");
			setRole("member");
			onOpenChange(false);
		} catch (error) {
			toast.error(
				errorMessage(
					error,
					t({
						message: "Failed to send invitation",
					}),
				),
			);
		} finally {
			setIsInviting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						<Trans>Invite Member</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>
							Send an invitation to join {organizationName}. Expires in 48
							hours.
						</Trans>
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-4">
					<div className="space-y-2">
						<Label htmlFor="email">
							<Trans>Email</Trans>
						</Label>
						<Input
							id="email"
							type="email"
							placeholder={t({
								message: "user@example.com",
							})}
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
						<Label htmlFor="role">
							<Trans>Role</Trans>
						</Label>
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
										{organizationRoleName(r)}
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
						<Trans>Cancel</Trans>
					</Button>
					<Button onClick={handleInvite} disabled={isInviting || !email}>
						{isInviting ? (
							<Trans>Sending...</Trans>
						) : (
							<Trans>Send Invitation</Trans>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

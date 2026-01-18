import {
	canInvite,
	getInvitableRoles,
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import { HiOutlinePlus } from "react-icons/hi2";
import { authClient } from "renderer/lib/auth-client";

export function InviteMemberButton() {
	const { data: session } = authClient.useSession();
	const { data: activeOrg } = authClient.useActiveOrganization();

	const organizationId = session?.session?.activeOrganizationId;
	const organizationName = activeOrg?.name;
	const currentUserRole = activeOrg?.members?.find(
		(m) => m.userId === session?.user?.id,
	)?.role as OrganizationRole | undefined;
	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState("");
	const [name, setName] = useState("");
	const [role, setRole] = useState<OrganizationRole>("member");
	const [isInviting, setIsInviting] = useState(false);

	const invitableRoles = currentUserRole ? getInvitableRoles(currentUserRole) : [];
	const canInviteAnyone = invitableRoles.length > 0;

	const handleInvite = async () => {
		if (!organizationId || !currentUserRole) return;

		if (!canInvite(currentUserRole, role)) {
			toast.error(`Cannot invite users as ${ORGANIZATION_ROLES[role].name}`);
			return;
		}

		setIsInviting(true);
		try {
			await authClient.organization.inviteMember({
				organizationId,
				email,
				name: name || undefined,
				role,
			});

			toast.success(`Invitation sent to ${email}`);
			setEmail("");
			setName("");
			setRole("member");
			setOpen(false);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to send invitation",
			);
		} finally {
			setIsInviting(false);
		}
	};

	if (!canInviteAnyone) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<Button disabled className="gap-2">
						<HiOutlinePlus className="h-4 w-4" />
						Invite Member
					</Button>
				</TooltipTrigger>
				<TooltipContent>Members cannot invite others</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<>
			<Button onClick={() => setOpen(true)} className="gap-2">
				<HiOutlinePlus className="h-4 w-4" />
				Invite Member
			</Button>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Invite Member</DialogTitle>
						<DialogDescription>
							Send an invitation to join {organizationName ?? "your organization"}. Expires in 48 hours.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4 py-4">
						<div className="space-y-2">
							<Label htmlFor="name">Name (optional)</Label>
							<Input
								id="name"
								type="text"
								placeholder="John Doe"
								value={name}
								onChange={(e) => setName(e.target.value)}
								disabled={isInviting}
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								type="email"
								placeholder="user@example.com"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
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
							onClick={() => setOpen(false)}
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
		</>
	);
}

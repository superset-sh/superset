import {
	getAvailableRoleChanges,
	getRoleLevel,
	ORGANIZATION_ROLES,
	type OrganizationRole,
} from "@superset/shared/auth";
import { alert } from "@superset/ui/atoms/Alert";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { HiEllipsisVertical, HiOutlineTrash } from "react-icons/hi2";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import type { TeamMember } from "../../../../types";

export function MemberActions({
	member,
	currentUserRole,
	ownerCount,
	isCurrentUser,
	canRemove,
}: {
	member: TeamMember;
	currentUserRole: OrganizationRole;
	ownerCount: number;
	isCurrentUser: boolean;
	canRemove: boolean;
}) {
	const [isChangingRole, setIsChangingRole] = useState(false);
	const { refetch: refetchSession } = authClient.useSession();
	const navigate = useNavigate();

	const availableRoles = getAvailableRoleChanges(
		currentUserRole,
		member.role,
		ownerCount,
	);

	async function leaveOrganization(): Promise<void> {
		const result = await apiTrpcClient.organization.leave.mutate({
			organizationId: member.organizationId,
		});

		// Update session with new active organization (or null if none left)
		await authClient.organization.setActive({
			organizationId: result.activeOrganizationId ?? null,
		});
		await refetchSession();
		navigate({ to: "/" });
	}

	async function removeMember(): Promise<void> {
		await apiTrpcClient.organization.removeMember.mutate({
			organizationId: member.organizationId,
			userId: member.userId,
		});
	}

	function handleRemove(): void {
		if (isCurrentUser) {
			toast.promise(leaveOrganization(), {
				loading: "Leaving organization...",
				success: "Left organization",
				error: (err) => err.message || "Failed to leave organization",
			});
		} else {
			toast.promise(removeMember(), {
				loading: "Removing member...",
				success: "Member removed",
				error: (err) => err.message || "Failed to remove member",
			});
		}
	}

	const handleRemoveClick = () => {
		alert.destructive({
			title: isCurrentUser ? "Leave organization?" : "Remove team member?",
			description: isCurrentUser
				? "Are you sure you want to leave this organization? You will lose access immediately."
				: `Are you sure you want to remove ${member.name} (${member.email}) from the organization? They will lose access immediately.`,
			confirmText: isCurrentUser ? "Leave Organization" : "Remove Member",
			cancelText: "Cancel",
			onConfirm: () => {
				handleRemove();
			},
		});
	};

	const handleChangeRole = async (newRole: OrganizationRole) => {
		setIsChangingRole(true);
		try {
			await apiTrpcClient.organization.updateMemberRole.mutate({
				organizationId: member.organizationId,
				memberId: member.memberId,
				role: newRole,
			});
			toast.success(`Role changed to ${ORGANIZATION_ROLES[newRole].name}`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to change role",
			);
		} finally {
			setIsChangingRole(false);
		}
	};

	const handleRoleSelection = (newRole: OrganizationRole) => {
		const isSelfDemotion =
			isCurrentUser && getRoleLevel(newRole) < getRoleLevel(member.role);

		if (isSelfDemotion) {
			alert.destructive({
				title: "Demote yourself?",
				description: `You're about to change your role from ${ORGANIZATION_ROLES[member.role].name} to ${ORGANIZATION_ROLES[newRole].name}. Another owner will need to restore your permissions. Are you sure?`,
				confirmText: "Yes, demote me",
				cancelText: "Cancel",
				onConfirm: async () => {
					await handleChangeRole(newRole);
				},
			});
		} else {
			handleChangeRole(newRole);
		}
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon" className="h-8 w-8">
					<HiEllipsisVertical className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{availableRoles.length > 0 && (
					<DropdownMenuSub>
						<DropdownMenuSubTrigger disabled={isChangingRole}>
							Change role
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>
							{availableRoles.map((role) => (
								<DropdownMenuItem
									key={role}
									onSelect={() => handleRoleSelection(role)}
									disabled={isChangingRole}
								>
									Change to {ORGANIZATION_ROLES[role].name}
								</DropdownMenuItem>
							))}
						</DropdownMenuSubContent>
					</DropdownMenuSub>
				)}

				{isCurrentUser ? (
					<DropdownMenuItem
						className="text-destructive gap-2"
						onSelect={handleRemoveClick}
					>
						<HiOutlineTrash className="h-4 w-4 text-destructive" />
						<span>Leave organization...</span>
					</DropdownMenuItem>
				) : canRemove ? (
					<DropdownMenuItem
						className="text-destructive gap-2"
						onSelect={handleRemoveClick}
					>
						<HiOutlineTrash className="h-4 w-4 text-destructive" />
						<span>Remove member</span>
					</DropdownMenuItem>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

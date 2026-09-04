import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	getAvailableRoleChanges,
	getRoleLevel,
	type OrganizationRole,
	organizationRoleName,
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
import { useCurrentPlan } from "renderer/hooks/useCurrentPlan";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpcClient } from "renderer/lib/trpc-client";
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
	const { t } = useLingui();
	const [isChangingRole, setIsChangingRole] = useState(false);
	const { refetch: refetchSession } = authClient.useSession();
	const { plan } = useCurrentPlan();
	const navigate = useNavigate();
	const utils = cloudTrpc.useUtils();

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
		// Move this window too. The window registry holds the org we just left;
		// left alone it would win on the next provider mount and pin the window
		// to an organization the user is no longer a member of.
		if (result.activeOrganizationId) {
			await electronTrpcClient.window.setActiveOrg.mutate({
				organizationId: result.activeOrganizationId,
			});
		}
		await refetchSession();
		await utils.organization.listMembers.invalidate();
		navigate({ to: "/" });
	}

	async function removeMember(): Promise<void> {
		await apiTrpcClient.organization.removeMember.mutate({
			organizationId: member.organizationId,
			userId: member.userId,
		});
		await utils.organization.listMembers.invalidate();
	}

	function handleRemove(): void {
		if (isCurrentUser) {
			toast.promise(leaveOrganization(), {
				loading: t({
					message: "Leaving organization...",
				}),
				success: t({
					message: "Left organization",
				}),
				error: (err) =>
					errorMessage(
						err,
						t({
							message: "Failed to leave organization",
						}),
					),
			});
		} else {
			toast.promise(removeMember(), {
				loading: t({
					message: "Removing member...",
				}),
				success: t({
					message: "Member removed",
				}),
				error: (err) =>
					errorMessage(
						err,
						t({
							message: "Failed to remove member",
						}),
					),
			});
		}
	}

	const handleRemoveClick = () => {
		const billingNote =
			plan === "pro" || plan === "enterprise"
				? ` ${t({
						message: "Your subscription will be adjusted accordingly.",
					})}`
				: "";

		const memberName = member.name;
		const memberEmail = member.email;
		alert({
			title: isCurrentUser
				? t({
						message: "Leave organization?",
					})
				: t({
						message: "Remove team member?",
					}),
			description: isCurrentUser
				? t({
						message: `Are you sure you want to leave this organization? You will lose access immediately.${billingNote}`,
					})
				: t({
						message: `Are you sure you want to remove ${memberName} (${memberEmail}) from the organization? They will lose access immediately.${billingNote}`,
					}),
			actions: [
				{
					label: t({
						message: "Cancel",
					}),
					variant: "outline",
					onClick: () => {},
				},
				{
					label: isCurrentUser
						? t({
								message: "Leave Organization",
							})
						: t({
								message: "Remove Member",
							}),
					variant: "destructive",
					onClick: () => handleRemove(),
				},
			],
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
			await utils.organization.listMembers.invalidate();
			const newRoleName = organizationRoleName(newRole);
			toast.success(
				t({
					message: `Role changed to ${newRoleName}`,
				}),
			);
		} catch (error) {
			toast.error(
				errorMessage(
					error,
					t({
						message: "Failed to change role",
					}),
				),
			);
		} finally {
			setIsChangingRole(false);
		}
	};

	const handleRoleSelection = (newRole: OrganizationRole) => {
		const isSelfDemotion =
			isCurrentUser && getRoleLevel(newRole) < getRoleLevel(member.role);

		if (isSelfDemotion) {
			const currentRoleName = organizationRoleName(member.role);
			const newRoleName = organizationRoleName(newRole);
			alert({
				title: t({
					message: "Demote yourself?",
				}),
				description: t({
					message: `You're about to change your role from ${currentRoleName} to ${newRoleName}. Another owner will need to restore your permissions. Are you sure?`,
				}),
				actions: [
					{
						label: t({
							message: "Cancel",
						}),
						variant: "outline",
						onClick: () => {},
					},
					{
						label: t({
							message: "Yes, demote me",
						}),
						variant: "destructive",
						onClick: () => handleChangeRole(newRole),
					},
				],
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
							<Trans>Change role</Trans>
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>
							{availableRoles.map((role) => (
								<DropdownMenuItem
									key={role}
									onSelect={() => handleRoleSelection(role)}
									disabled={isChangingRole}
								>
									<Trans>Change to {organizationRoleName(role)}</Trans>
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
						<span>
							<Trans>Leave organization...</Trans>
						</span>
					</DropdownMenuItem>
				) : canRemove ? (
					<DropdownMenuItem
						className="text-destructive gap-2"
						onSelect={handleRemoveClick}
					>
						<HiOutlineTrash className="h-4 w-4 text-destructive" />
						<span>
							<Trans>Remove member</Trans>
						</span>
					</DropdownMenuItem>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

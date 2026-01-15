import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { HiEllipsisVertical, HiOutlineTrash } from "react-icons/hi2";
import { authClient } from "renderer/lib/auth-client";

export interface MemberDetails {
	memberId: string;
	userId: string;
	name: string | null;
	email: string;
	image: string | null;
	role: string;
	joinedAt: Date;
	organizationId: string;
}

interface MemberActionsProps {
	member: MemberDetails;
	isCurrentUser: boolean;
	canRemove: boolean;
}

export function MemberActions({
	member,
	isCurrentUser,
	canRemove,
}: MemberActionsProps) {
	const [showRemoveDialog, setShowRemoveDialog] = useState(false);
	const [isRemoving, setIsRemoving] = useState(false);

	const handleRemove = async () => {
		setIsRemoving(true);
		try {
			if (isCurrentUser) {
				await authClient.organization.leave({
					organizationId: member.organizationId,
				});
				toast.success("Left organization");
			} else {
				await authClient.organization.removeMember({
					organizationId: member.organizationId,
					memberIdOrEmail: member.userId,
				});
				toast.success("Member removed");
			}
			setShowRemoveDialog(false);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: `Failed to ${isCurrentUser ? "leave" : "remove member from"} organization`,
			);
		} finally {
			setIsRemoving(false);
		}
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="icon" className="h-8 w-8">
						<HiEllipsisVertical className="h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					{isCurrentUser ? (
						<DropdownMenuItem
							className="text-destructive gap-2"
							onSelect={() => setShowRemoveDialog(true)}
						>
							<HiOutlineTrash className="h-4 w-4" />
							<span>Leave organization...</span>
						</DropdownMenuItem>
					) : canRemove ? (
						<DropdownMenuItem
							className="text-destructive gap-2"
							onSelect={() => setShowRemoveDialog(true)}
						>
							<HiOutlineTrash className="h-4 w-4" />
							<span>Remove member</span>
						</DropdownMenuItem>
					) : null}
				</DropdownMenuContent>
			</DropdownMenu>

			<Dialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{isCurrentUser ? "Leave organization?" : "Remove member?"}
						</DialogTitle>
						<DialogDescription>
							{isCurrentUser ? (
								<>
									Are you sure you want to leave this organization? You will
									lose access immediately.
								</>
							) : (
								<>
									Are you sure you want to remove <strong>{member.name}</strong>{" "}
									({member.email}) from the organization? They will lose access
									immediately.
								</>
							)}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setShowRemoveDialog(false)}
							disabled={isRemoving}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={handleRemove}
							disabled={isRemoving}
						>
							{isRemoving
								? isCurrentUser
									? "Leaving..."
									: "Removing..."
								: isCurrentUser
									? "Leave Organization"
									: "Remove Member"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

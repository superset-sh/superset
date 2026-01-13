import { authClient } from "@superset/auth/client";
import { Avatar } from "@superset/ui/atoms/Avatar";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import type { MemberDetails } from "../MemberActions";

interface MemberRowProps {
	member: MemberDetails;
	isCurrentUser: boolean;
	canRemove: boolean;
}

export function MemberRow({
	member,
	isCurrentUser,
	canRemove,
}: MemberRowProps) {
	const [showRemoveDialog, setShowRemoveDialog] = useState(false);
	const [isRemoving, setIsRemoving] = useState(false);

	const handleRemove = async () => {
		setIsRemoving(true);
		try {
			await authClient.organization.removeMember({
				organizationId: member.organizationId,
				memberIdOrEmail: member.userId,
			});
			toast.success("Member removed");
			setShowRemoveDialog(false);
			// Electric collections will automatically update via real-time sync
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to remove member",
			);
		} finally {
			setIsRemoving(false);
		}
	};

	const isOwner = member.role === "owner";

	return (
		<>
			<div className="flex items-center gap-4 p-4 rounded-lg border bg-card">
				<Avatar size="lg" fullName={member.name} image={member.image} />

				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<p className="font-medium truncate">{member.name || "Unknown"}</p>
						{isCurrentUser && (
							<Badge variant="secondary" className="text-xs">
								You
							</Badge>
						)}
					</div>
					<div className="flex items-center gap-2 mt-0.5">
						<p className="text-sm text-muted-foreground truncate">
							{member.email}
						</p>
						<Badge
							variant={isOwner ? "default" : "outline"}
							className="text-xs shrink-0"
						>
							{member.role}
						</Badge>
					</div>
				</div>

				{canRemove && (
					<Button
						variant="outline"
						size="sm"
						onClick={() => setShowRemoveDialog(true)}
						className="shrink-0"
					>
						Remove
					</Button>
				)}
			</div>

			<Dialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Remove team member?</DialogTitle>
						<DialogDescription>
							Are you sure you want to remove <strong>{member.name}</strong> (
							{member.email}) from the organization? They will lose access
							immediately.
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
							{isRemoving ? "Removing..." : "Remove Member"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

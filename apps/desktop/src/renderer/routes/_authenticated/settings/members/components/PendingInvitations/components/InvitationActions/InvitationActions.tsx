import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { HiEllipsisVertical, HiOutlineXMark } from "react-icons/hi2";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

interface InvitationActionsProps {
	invitation: { id: string };
}

export function InvitationActions({ invitation }: InvitationActionsProps) {
	const { t } = useLingui();
	const [isCanceling, setIsCanceling] = useState(false);
	const utils = cloudTrpc.useUtils();

	const handleCancel = async () => {
		setIsCanceling(true);
		try {
			await authClient.organization.cancelInvitation({
				invitationId: invitation.id,
			});
			await utils.organization.listInvitations.invalidate();
			toast.success(
				t({
					message: "Invitation canceled",
				}),
			);
		} catch (error) {
			toast.error(
				errorMessage(
					error,
					t({
						message: "Failed to cancel invitation",
					}),
				),
			);
		} finally {
			setIsCanceling(false);
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
				<DropdownMenuItem
					onSelect={handleCancel}
					disabled={isCanceling}
					className="text-destructive gap-2"
				>
					<HiOutlineXMark className="h-4 w-4" />
					<Trans>Cancel</Trans>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

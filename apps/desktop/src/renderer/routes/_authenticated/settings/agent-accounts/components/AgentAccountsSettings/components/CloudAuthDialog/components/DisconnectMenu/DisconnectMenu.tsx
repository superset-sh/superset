import { Trans, useLingui } from "@lingui/react/macro";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { EllipsisVertical } from "lucide-react";
import { useState } from "react";

export function DisconnectMenu({
	agentLabel,
	credential,
	disconnect,
}: {
	agentLabel: string;
	credential: string;
	disconnect: () => Promise<unknown>;
}) {
	const { t } = useLingui();
	const [confirming, setConfirming] = useState(false);
	const handleDisconnect = async () => {
		try {
			await disconnect();
			toast.success(
				t({ message: `Removed ${credential} for ${agentLabel}.` }),
				{
					description: t({
						message: "Restart workspaces to pick up new agent credentials.",
					}),
				},
			);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: t({ message: "Could not disconnect." }),
			);
		}
	};
	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						aria-label={t({ message: "More options" })}
						className="size-7"
						size="icon"
						variant="ghost"
					>
						<EllipsisVertical className="size-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem
						onSelect={() => setConfirming(true)}
						variant="destructive"
					>
						<Trans>Disconnect</Trans>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<AlertDialog onOpenChange={setConfirming} open={confirming}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							<Trans>Disconnect {credential}?</Trans>
						</AlertDialogTitle>
						<AlertDialogDescription>
							<Trans>
								Cloud workspaces will stop running {agentLabel} with it.
							</Trans>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							<Trans>Cancel</Trans>
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => void handleDisconnect()}
							variant="destructive"
						>
							<Trans>Disconnect</Trans>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

import { Trans } from "@lingui/react/macro";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	EnterEnabledAlertDialogContent,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import type { UsageAccount } from "../../../../hooks/useHostUsageQuota";

interface RemoveAccountDialogProps {
	/** The profile to remove; null keeps the dialog closed. */
	account: UsageAccount | null;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	isRemoving: boolean;
}

export function RemoveAccountDialog({
	account,
	onOpenChange,
	onConfirm,
	isRemoving,
}: RemoveAccountDialogProps) {
	const label = account ? (account.email ?? account.sourceLabel) : "";
	return (
		<AlertDialog open={account !== null} onOpenChange={onOpenChange}>
			<EnterEnabledAlertDialogContent className="max-w-[380px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">
						<Trans>Remove {label}?</Trans>
					</AlertDialogTitle>
					<AlertDialogDescription>
						{account?.agent === "codex" ? (
							<Trans>
								Deletes the {account.sourceLabel} profile, its saved sign-in on
								this machine, and its local Codex session history. The account
								itself is unaffected.
							</Trans>
						) : (
							<Trans>
								Deletes the {account?.sourceLabel} profile and its saved sign-in
								on this machine. The account itself is unaffected.
							</Trans>
						)}{" "}
						<Trans>Running agents on this profile lose access.</Trans>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter className="flex-row justify-end gap-2 px-4 pt-2 pb-4">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => onOpenChange(false)}
					>
						<Trans>Cancel</Trans>
					</Button>
					<AlertDialogAction
						variant="destructive"
						size="sm"
						className="h-7 px-3 text-xs"
						disabled={isRemoving}
						onClick={onConfirm}
					>
						<Trans>Remove</Trans>
					</AlertDialogAction>
				</AlertDialogFooter>
			</EnterEnabledAlertDialogContent>
		</AlertDialog>
	);
}

import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { useEffect, useState } from "react";

const CONFIRM_PHRASE = "I understand";

interface ExposeViaRelayConfirmDialogProps {
	open: boolean;
	targetEnabled: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}

export function ExposeViaRelayConfirmDialog({
	open,
	targetEnabled,
	onOpenChange,
	onConfirm,
}: ExposeViaRelayConfirmDialogProps) {
	const [typed, setTyped] = useState("");

	// Reset the typed confirmation whenever the dialog closes so reopening
	// always starts from an empty input.
	useEffect(() => {
		if (!open) setTyped("");
	}, [open]);

	const canConfirm = !targetEnabled || typed === CONFIRM_PHRASE;

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="max-w-[480px]">
				<AlertDialogHeader>
					<AlertDialogTitle>
						{targetEnabled ? "Enable Relay access?" : "Disable Relay access?"}
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="space-y-3 text-sm text-muted-foreground">
							<p>
								This restarts the host service and stops running terminals. File
								watches and other host-backed work will be interrupted.
							</p>
							{targetEnabled ? (
								<p>
									Remote workspaces you grant access to will be able to reach
									this device through Superset Relay.
								</p>
							) : (
								<p>
									Remote workspaces will no longer be able to reach this device
									through Superset Relay.
								</p>
							)}
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>

				{targetEnabled && (
					<div className="space-y-2 pt-2">
						<Label htmlFor="expose-relay-confirm" className="text-xs">
							Type{" "}
							<span className="font-mono font-medium text-foreground">
								{CONFIRM_PHRASE}
							</span>{" "}
							to continue
						</Label>
						<Input
							id="expose-relay-confirm"
							autoFocus
							value={typed}
							onChange={(event) => setTyped(event.target.value)}
							placeholder={CONFIRM_PHRASE}
							autoComplete="off"
							spellCheck={false}
						/>
					</div>
				)}

				<AlertDialogFooter>
					<Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						size="sm"
						disabled={!canConfirm}
						onClick={onConfirm}
					>
						{targetEnabled ? "Enable and restart" : "Disable and restart"}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

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
						{targetEnabled
							? "Expose this device to Superset Relay?"
							: "Turn off Superset Relay access?"}
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="space-y-3 text-sm text-muted-foreground">
							<p>
								Changing this setting restarts the host service. Any connected
								workspace operations going through this host may briefly
								disconnect.
							</p>
							{targetEnabled ? (
								<>
									<p>
										Turning this on allows any remote device which you grant
										access to — and anything that can compromise the Superset
										Relay — to reach into this device to run commands. They will
										be able to read and write files in your configured project
										directories, run shell commands as you, and access any tools
										the host service exposes.
									</p>
									<p>
										Only enable this if you are okay with the risk that this
										entails. Most users should leave this off.
									</p>
								</>
							) : (
								<p>
									Turning this off prevents remote workspaces from reaching this
									device through the Superset relay. Existing remote sessions
									targeting this host may lose access until they reconnect
									elsewhere or relay access is enabled again.
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
						variant={targetEnabled ? "destructive" : "default"}
						size="sm"
						disabled={!canConfirm}
						onClick={onConfirm}
					>
						{targetEnabled ? "Enable" : "Disable"}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

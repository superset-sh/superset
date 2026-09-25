import { Trans, useLingui } from "@lingui/react/macro";
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
import { useState } from "react";

interface RenameSessionDialogProps {
	/** The session's current name, or "" when it has never been named. */
	name: string;
	onClose: () => void;
	onSubmit: (name: string) => void;
}

/**
 * Names a terminal session, or clears the name by submitting nothing.
 *
 * Mounted only while it is open, so each session it opens on starts from that
 * session's name with no copying back and forth.
 */
export function RenameSessionDialog({
	name,
	onClose,
	onSubmit,
}: RenameSessionDialogProps) {
	const { t } = useLingui();
	const [value, setValue] = useState(name);

	const handleSubmit = () => {
		onClose();
		if (value.trim() === name.trim()) return;
		onSubmit(value);
	};

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent className="max-w-[360px]">
				<DialogHeader>
					<DialogTitle className="font-medium">
						<Trans>Rename session</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>
							Leave it empty to go back to the name the terminal reports.
						</Trans>
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						handleSubmit();
					}}
				>
					<Input
						autoFocus
						value={value}
						onChange={(event) => setValue(event.target.value)}
						onFocus={(event) => event.target.select()}
						aria-label={t({ message: "Session name" })}
						className="h-8 text-sm"
					/>
					<DialogFooter className="flex-row justify-end gap-2">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={onClose}
						>
							<Trans>Cancel</Trans>
						</Button>
						<Button type="submit" size="sm" className="h-7 px-3 text-xs">
							<Trans>Save</Trans>
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

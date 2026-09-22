"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { useEffect, useState } from "react";
import { Button } from "../../../../../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../../../../../ui/dialog";
import { Input } from "../../../../../ui/input";
import { toast } from "../../../../../ui/sonner";

interface RenamePageDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	onRename: (title: string) => Promise<void>;
}

export function RenamePageDialog({
	open,
	onOpenChange,
	title,
	onRename,
}: RenamePageDialogProps) {
	const { t } = useLingui();
	const [value, setValue] = useState(title);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		if (open) setValue(title);
	}, [open, title]);

	const trimmed = value.trim();
	const submittable = trimmed.length > 0 && trimmed !== title && !busy;

	const submit = async () => {
		if (!submittable) return;
		setBusy(true);
		try {
			await onRename(trimmed);
			onOpenChange(false);
		} catch (error) {
			toast.error(
				errorMessage(error, t({ message: "Could not rename this page" })),
			);
		} finally {
			setBusy(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>
						<Trans>Rename page</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>
							The title shows everywhere this page is listed and in its link
							preview.
						</Trans>
					</DialogDescription>
				</DialogHeader>

				<Input
					autoFocus
					value={value}
					maxLength={200}
					disabled={busy}
					aria-label={t({ message: "Page title" })}
					onChange={(event) => setValue(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							void submit();
						}
					}}
				/>

				<DialogFooter>
					<Button
						size="sm"
						variant="ghost"
						disabled={busy}
						onClick={() => onOpenChange(false)}
					>
						<Trans>Cancel</Trans>
					</Button>
					<Button
						size="sm"
						disabled={!submittable}
						onClick={() => void submit()}
					>
						<Trans>Rename</Trans>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

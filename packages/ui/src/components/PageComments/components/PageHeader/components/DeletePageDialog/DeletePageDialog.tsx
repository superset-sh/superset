"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "../../../../../ui/alert-dialog";
import { toast } from "../../../../../ui/sonner";

interface DeletePageDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	versionCount: number;
	onConfirm: () => Promise<void>;
}

export function DeletePageDialog({
	open,
	onOpenChange,
	title,
	versionCount,
	onConfirm,
}: DeletePageDialogProps) {
	const { t } = useLingui();
	const [busy, setBusy] = useState(false);

	const confirm = async () => {
		setBusy(true);
		try {
			await onConfirm();
			onOpenChange(false);
		} catch (error) {
			toast.error(
				errorMessage(
					error,
					t({
						id: "ui.deletePageDialog.deleteFailed",
						message: "Could not delete this page",
					}),
				),
			);
		} finally {
			setBusy(false);
		}
	};

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						<Trans id="ui.deletePageDialog.title">Delete “{title}”?</Trans>
					</AlertDialogTitle>
					<AlertDialogDescription>
						{versionCount > 1 ? (
							<Trans id="ui.deletePageDialog.descriptionMany">
								All {versionCount} versions and their content are removed.
								Anyone with the link loses access.
							</Trans>
						) : (
							<Trans id="ui.deletePageDialog.descriptionOne">
								The page and its content are removed. Anyone with the link loses
								access.
							</Trans>
						)}{" "}
						<Trans id="ui.deletePageDialog.irreversible">
							This cannot be undone.
						</Trans>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={busy}>
						<Trans id="ui.deletePageDialog.cancel">Cancel</Trans>
					</AlertDialogCancel>
					<AlertDialogAction
						disabled={busy}
						onClick={(event) => {
							event.preventDefault();
							void confirm();
						}}
					>
						{busy ? (
							<Trans id="ui.deletePageDialog.deleting">Deleting…</Trans>
						) : (
							<Trans id="ui.deletePageDialog.confirm">Delete page</Trans>
						)}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

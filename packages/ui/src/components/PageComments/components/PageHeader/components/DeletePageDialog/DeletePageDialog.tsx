"use client";

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
	const [busy, setBusy] = useState(false);

	const confirm = async () => {
		setBusy(true);
		try {
			await onConfirm();
			onOpenChange(false);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not delete this page",
			);
		} finally {
			setBusy(false);
		}
	};

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete “{title}”?</AlertDialogTitle>
					<AlertDialogDescription>
						{versionCount > 1
							? `All ${versionCount} versions and their content are removed. Anyone with the link loses access.`
							: "The page and its content are removed. Anyone with the link loses access."}{" "}
						This cannot be undone.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
					<AlertDialogAction
						disabled={busy}
						onClick={(event) => {
							event.preventDefault();
							void confirm();
						}}
					>
						{busy ? "Deleting…" : "Delete page"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

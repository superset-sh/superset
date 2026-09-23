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
import { Label } from "@superset/ui/label";
import { useEffect, useState } from "react";
import type { ProjectFolder } from "../../types";

/** Mirrors `sanitizeFolderName` on the host; keep the two in step. */
const FOLDER_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const FOLDER_NAME_MAX_LENGTH = 64;

interface RenameFolderDialogProps {
	folder: ProjectFolder | null;
	takenNames: string[];
	isSubmitting: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (name: string) => void;
}

export function RenameFolderDialog({
	folder,
	takenNames,
	isSubmitting,
	onOpenChange,
	onSubmit,
}: RenameFolderDialogProps) {
	const { t } = useLingui();
	const [name, setName] = useState("");

	useEffect(() => {
		if (folder) setName(folder.folder);
	}, [folder]);

	const trimmed = name.trim();
	const isTaken = takenNames.some(
		(taken) =>
			taken.toLowerCase() !== folder?.folder.toLowerCase() &&
			taken.toLowerCase() === trimmed.toLowerCase(),
	);
	const error = !trimmed
		? null
		: trimmed.length > FOLDER_NAME_MAX_LENGTH ||
				!FOLDER_NAME_PATTERN.test(trimmed)
			? t({
					message:
						"Use letters, digits, dots, dashes or underscores, starting with a letter or digit.",
				})
			: isTaken
				? t({
						message: "Another folder in this project already has that name.",
					})
				: null;
	const canSubmit =
		Boolean(trimmed) && !error && !isSubmitting && trimmed !== folder?.folder;

	return (
		<Dialog open={folder !== null} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						<Trans>Rename folder</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>
							This is the directory the repository is checked out into inside
							each workspace.
						</Trans>
					</DialogDescription>
				</DialogHeader>
				<form
					className="space-y-2"
					onSubmit={(event) => {
						event.preventDefault();
						if (canSubmit) onSubmit(trimmed);
					}}
				>
					<Label htmlFor="source-folder-name" className="text-sm font-medium">
						<Trans>Folder name</Trans>
					</Label>
					<Input
						id="source-folder-name"
						value={name}
						autoFocus
						maxLength={FOLDER_NAME_MAX_LENGTH}
						onChange={(event) => setName(event.target.value)}
					/>
					{error && <p className="text-xs text-destructive">{error}</p>}
					<DialogFooter className="pt-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={isSubmitting}
						>
							<Trans>Cancel</Trans>
						</Button>
						<Button type="submit" disabled={!canSubmit}>
							<Trans>Rename</Trans>
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

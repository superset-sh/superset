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
import { type FormEvent, useState } from "react";
import type {
	FolderFirstImportState,
	UseFolderFirstImportResult,
} from "../../hooks/useFolderFirstImport";

interface FolderFirstImportModalProps {
	state: FolderFirstImportState;
	onCancel: UseFolderFirstImportResult["cancel"];
	onConfirmCreateAsNew: UseFolderFirstImportResult["confirmCreateAsNew"];
}

export function FolderFirstImportModal({
	state,
	onCancel,
	onConfirmCreateAsNew,
}: FolderFirstImportModalProps) {
	const open = state.kind !== "idle";
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) onCancel();
			}}
		>
			<DialogContent className="max-w-md">
				{state.kind === "no-match" && (
					<NoMatchContent
						repoPath={state.repoPath}
						working={state.working}
						onCancel={onCancel}
						onConfirm={onConfirmCreateAsNew}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}

interface NoMatchContentProps {
	repoPath: string;
	working: boolean;
	onCancel: () => void;
	onConfirm: (input: { name: string }) => Promise<void>;
}

function NoMatchContent({
	repoPath,
	working,
	onCancel,
	onConfirm,
}: NoMatchContentProps) {
	const [name, setName] = useState("");
	const trimmed = name.trim();
	const canSubmit = trimmed.length > 0 && !working;

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!canSubmit) return;
		void onConfirm({ name: trimmed });
	};

	return (
		<form onSubmit={handleSubmit}>
			<DialogHeader>
				<DialogTitle>Create a new project?</DialogTitle>
				<DialogDescription>
					No existing project matches this folder. Name it to create a new
					project bound to the folder's git remote.
				</DialogDescription>
			</DialogHeader>
			<div className="space-y-3 py-4">
				<div className="space-y-1">
					<Label className="text-xs text-muted-foreground">Folder</Label>
					<code className="block truncate rounded bg-muted px-2 py-1 text-xs">
						{repoPath}
					</code>
				</div>
				<div className="space-y-1">
					<Label htmlFor="folder-first-project-name">Project name</Label>
					<Input
						id="folder-first-project-name"
						autoFocus
						value={name}
						onChange={(event) => setName(event.target.value)}
						disabled={working}
						placeholder="e.g. my-project"
					/>
				</div>
			</div>
			<DialogFooter>
				<Button
					type="button"
					variant="outline"
					onClick={onCancel}
					disabled={working}
				>
					Cancel
				</Button>
				<Button type="submit" disabled={!canSubmit}>
					{working ? "Creating…" : "Create project"}
				</Button>
			</DialogFooter>
		</form>
	);
}

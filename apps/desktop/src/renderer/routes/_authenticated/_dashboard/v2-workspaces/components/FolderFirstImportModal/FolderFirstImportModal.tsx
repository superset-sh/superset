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
	onConfirmPickCandidate: UseFolderFirstImportResult["confirmPickCandidate"];
	onConfirmRepoint: UseFolderFirstImportResult["confirmRepoint"];
}

export function FolderFirstImportModal({
	state,
	onCancel,
	onConfirmCreateAsNew,
	onConfirmPickCandidate,
	onConfirmRepoint,
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
				{state.kind === "pick" && (
					<CandidatePickerContent
						repoPath={state.repoPath}
						candidates={state.candidates}
						working={state.working}
						onCancel={onCancel}
						onConfirm={onConfirmPickCandidate}
					/>
				)}
				{state.kind === "confirm-repoint" && (
					<ConfirmRepointContent
						repoPath={state.repoPath}
						projectName={state.projectName}
						working={state.working}
						onCancel={onCancel}
						onConfirm={onConfirmRepoint}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}

interface ConfirmRepointContentProps {
	repoPath: string;
	projectName: string;
	working: boolean;
	onCancel: () => void;
	onConfirm: () => Promise<void>;
}

function ConfirmRepointContent({
	repoPath,
	projectName,
	working,
	onCancel,
	onConfirm,
}: ConfirmRepointContentProps) {
	return (
		<>
			<DialogHeader>
				<DialogTitle>Re-point {projectName} to this folder?</DialogTitle>
				<DialogDescription>
					This project is already set up on this device at a different path.
					Re-pointing it here will invalidate existing workspaces under it —
					their worktrees will no longer open until each workspace is
					re-created. Continue?
				</DialogDescription>
			</DialogHeader>
			<div className="space-y-1 py-4">
				<code className="block truncate rounded bg-muted px-2 py-1 text-xs">
					{repoPath}
				</code>
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
				<Button
					type="button"
					variant="destructive"
					onClick={() => void onConfirm()}
					disabled={working}
				>
					{working ? "Re-pointing…" : "Re-point anyway"}
				</Button>
			</DialogFooter>
		</>
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

interface CandidatePickerContentProps {
	repoPath: string;
	candidates: Array<{
		id: string;
		name: string;
		organizationName: string;
	}>;
	working: boolean;
	onCancel: () => void;
	onConfirm: (candidateId: string) => Promise<void>;
}

function CandidatePickerContent({
	repoPath,
	candidates,
	working,
	onCancel,
	onConfirm,
}: CandidatePickerContentProps) {
	const [selectedId, setSelectedId] = useState<string | null>(
		candidates[0]?.id ?? null,
	);
	const canSubmit = selectedId != null && !working;

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!canSubmit || !selectedId) return;
		void onConfirm(selectedId);
	};

	return (
		<form onSubmit={handleSubmit}>
			<DialogHeader>
				<DialogTitle>Pick a project</DialogTitle>
				<DialogDescription>
					This folder's git remote matches multiple projects you have access to.
					Which one is this folder for?
				</DialogDescription>
			</DialogHeader>
			<div className="space-y-3 py-4">
				<div className="space-y-1">
					<Label className="text-xs text-muted-foreground">Folder</Label>
					<code className="block truncate rounded bg-muted px-2 py-1 text-xs">
						{repoPath}
					</code>
				</div>
				<div className="flex flex-col gap-1.5">
					{candidates.map((candidate) => {
						const selected = candidate.id === selectedId;
						return (
							<button
								key={candidate.id}
								type="button"
								onClick={() => setSelectedId(candidate.id)}
								disabled={working}
								className={[
									"flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors",
									selected
										? "border-primary bg-primary/5"
										: "border-border hover:bg-muted/50",
								].join(" ")}
							>
								<span className="font-medium">{candidate.name}</span>
								<span className="text-xs text-muted-foreground">
									{candidate.organizationName}
								</span>
							</button>
						);
					})}
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
					{working ? "Setting up…" : "Set up here"}
				</Button>
			</DialogFooter>
		</form>
	);
}

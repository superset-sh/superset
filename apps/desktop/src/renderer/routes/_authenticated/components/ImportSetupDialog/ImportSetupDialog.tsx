import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { invalidateHostServiceQuery } from "@superset/workspace-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { HiExclamationTriangle } from "react-icons/hi2";
import type { SetupImportCandidate } from "renderer/hooks/host-service/useSetupImportCandidates";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { ImportedScriptPreview } from "./components/ImportedScriptPreview";
import { NotImportedList } from "./components/NotImportedList";

const SCRIPT_KEYS = ["setup", "teardown", "run"] as const;

interface ImportSetupDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	hostUrl: string;
	projectId: string;
	candidates: SetupImportCandidate[];
	/** `.superset/config.json` exists but is not JSON; importing would fail. */
	configInvalid?: boolean;
	/** Adds a toast action that opens the project's scripts settings. */
	linkToSettings?: boolean;
}

export function ImportSetupDialog({
	open,
	onOpenChange,
	hostUrl,
	projectId,
	candidates,
	configInvalid = false,
	linkToSettings = false,
}: ImportSetupDialogProps) {
	const { t } = useLingui();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [selectedSource, setSelectedSource] = useState<string | null>(null);
	const candidate =
		candidates.find((entry) => entry.source === selectedSource) ??
		candidates[0];
	const openerRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		if (open && document.activeElement instanceof HTMLElement) {
			openerRef.current = document.activeElement;
		}
	}, [open]);

	const describeError = (error: unknown, label: string) => {
		const code = (error as { data?: { code?: string } } | null)?.data?.code;
		if (code === "CONFLICT") {
			return t`This setup changed while the dialog was open. Review the update and import again.`;
		}
		if (code === "NOT_FOUND") {
			return t`The ${label} setup file is no longer in this project.`;
		}
		if (code === "PRECONDITION_FAILED") {
			return t`Superset does not write through a symlink or outside this project.`;
		}
		if (code === "BAD_REQUEST") {
			return t`.superset/config.json is not valid JSON. Fix it, then import again.`;
		}
		return errorMessage(error);
	};

	const importMutation = useMutation({
		mutationFn: (input: {
			source: SetupImportCandidate["source"];
			overwrite: boolean;
			fingerprint: string;
		}) =>
			getHostServiceClientByUrl(hostUrl).config.importSetup.mutate({
				projectId,
				...input,
			}),
		onSuccess: (_, { source }) => {
			const label =
				candidates.find((entry) => entry.source === source)?.label ?? source;
			toast.success(t`Imported setup from ${label}`, {
				...(linkToSettings && {
					action: {
						label: t`View scripts`,
						onClick: () =>
							navigate({
								to: "/settings/projects/$projectId",
								params: { projectId },
							}),
					},
				}),
			});
			onOpenChange(false);
		},
		onError: (error, { source }) => {
			const label =
				candidates.find((entry) => entry.source === source)?.label ?? source;
			toast.error(describeError(error, label));
		},
		onSettled: () => {
			void queryClient.invalidateQueries({ queryKey: ["host-config"] });
			invalidateHostServiceQuery(hostUrl, [
				"config",
				"getWorkspaceRunDefinition",
			]);
		},
	});

	const restoreFocus = (event: Event) => {
		const opener = openerRef.current;
		if (opener?.isConnected) {
			event.preventDefault();
			opener.focus();
		}
	};

	if (!candidate) {
		return (
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent
					className="top-[8vh] translate-y-0 sm:max-w-md"
					onCloseAutoFocus={restoreFocus}
				>
					<DialogHeader>
						<DialogTitle>
							<Trans>Nothing left to import</Trans>
						</DialogTitle>
						<DialogDescription>
							<Trans>
								The setup files from other tools are gone, or this project
								already uses them.
							</Trans>
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							<Trans>Close</Trans>
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		);
	}

	const label = candidate.label;
	const replaces = candidate.conflicts.length > 0;
	const conflictFor = (field: string) =>
		candidate.conflicts.find((conflict) => conflict.field === field);
	const cwdConflict = conflictFor("cwd");
	const fileList = candidate.files.join(", ");
	const unsafePaths = candidate.unsafePaths ?? [];
	const unsafePathList = unsafePaths.join(", ");
	const currentCwd = cwdConflict?.current[0];
	const importedCwd = candidate.cwd;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="top-[8vh] flex max-h-[84vh] translate-y-0 flex-col sm:max-w-2xl"
				onCloseAutoFocus={restoreFocus}
			>
				<DialogHeader>
					<DialogTitle>
						<Trans>Import setup from {label}</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>
							Superset writes these scripts to .superset/config.json in this
							project. Review them before you import.
						</Trans>
					</DialogDescription>
				</DialogHeader>

				{candidates.length > 1 && (
					<div className="flex flex-wrap gap-1.5">
						{candidates.map((entry) => (
							<Button
								key={entry.source}
								size="sm"
								variant={
									entry.source === candidate.source ? "secondary" : "ghost"
								}
								className={cn(
									"h-7 text-xs",
									entry.source === candidate.source && "font-semibold",
								)}
								onClick={() => setSelectedSource(entry.source)}
							>
								{entry.label}
							</Button>
						))}
					</div>
				)}

				<div className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1">
					<p className="text-xs text-muted-foreground">
						<Trans>
							Read from <code className="font-mono">{fileList}</code>
						</Trans>
					</p>

					{SCRIPT_KEYS.map((key) => {
						const plan = candidate.scripts[key];
						if (!plan) return null;
						return (
							<ImportedScriptPreview
								key={key}
								scriptKey={key}
								plan={plan}
								conflict={conflictFor(key)}
							/>
						);
					})}

					{candidate.cwd && (
						<div className="space-y-1">
							<p className="text-sm font-medium">
								<Trans>Working directory</Trans>
							</p>
							<p className="text-xs text-muted-foreground">
								{currentCwd ? (
									<Trans>
										Replaces <code className="font-mono">{currentCwd}</code>{" "}
										with <code className="font-mono">{importedCwd}</code>
									</Trans>
								) : (
									<code className="font-mono">{importedCwd}</code>
								)}
							</p>
						</div>
					)}

					<NotImportedList entries={candidate.notImported} />
				</div>

				{unsafePaths.length > 0 && (
					<p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
						<HiExclamationTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
						<span>
							<Trans>
								<code className="font-mono">{unsafePathList}</code> is a symlink
								or leads outside this project. Superset does not write through
								it; replace it with a regular file or folder, then import.
							</Trans>
						</span>
					</p>
				)}

				{configInvalid && (
					<p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
						<HiExclamationTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
						<span>
							<Trans>
								<code className="font-mono">.superset/config.json</code> is not
								valid JSON. Fix it before you import, so Superset does not
								overwrite it.
							</Trans>
						</span>
					</p>
				)}

				<DialogFooter className="items-center gap-2 sm:justify-between">
					<p className="text-xs text-muted-foreground">
						{replaces && (
							<Trans>This replaces part of your current Superset setup.</Trans>
						)}
					</p>
					<div className="flex gap-2">
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							<Trans>Cancel</Trans>
						</Button>
						<Button
							variant={replaces ? "destructive" : "default"}
							disabled={
								importMutation.isPending ||
								configInvalid ||
								unsafePaths.length > 0
							}
							onClick={() =>
								importMutation.mutate({
									source: candidate.source,
									overwrite: replaces,
									fingerprint: candidate.fingerprint,
								})
							}
						>
							{replaces ? (
								<Trans>Replace and import</Trans>
							) : (
								<Trans>Import</Trans>
							)}
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

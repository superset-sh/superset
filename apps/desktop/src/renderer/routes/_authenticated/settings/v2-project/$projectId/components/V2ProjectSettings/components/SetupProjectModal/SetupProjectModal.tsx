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
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { useEffect, useState } from "react";
import { LuFolderOpen, LuLoaderCircle, LuTriangleAlert } from "react-icons/lu";
import { RemotePathPicker } from "renderer/components/RemotePathPicker";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { CloneAccessStatus } from "renderer/routes/_authenticated/components/CloneAccessStatus";
import {
	GhAuthDialog,
	type GhAuthDialogMode,
} from "renderer/routes/_authenticated/components/GhAuthDialog";
import { useCloneAccessPlan } from "renderer/routes/_authenticated/hooks/useCloneAccessPlan";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import {
	type CloneError,
	classifyCloneError,
} from "renderer/utils/classifyCloneError";

type SetupMode = "clone" | "import";

interface SetupProjectModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projectId: string;
	projectName?: string;
	hostUrl: string | null;
	hostName: string;
	repoCloneUrl: string | null;
	isRemoteTarget: boolean;
	onChanged?: () => void;
}

export function SetupProjectModal({
	open,
	onOpenChange,
	projectId,
	projectName,
	hostUrl,
	hostName,
	repoCloneUrl,
	isRemoteTarget,
	onChanged,
}: SetupProjectModalProps) {
	const { t } = useLingui();
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();
	const { ensureProjectInSidebar, ensureWorkspaceInSidebar } =
		useDashboardSidebarState();

	const [mode, setMode] = useState<SetupMode>(
		repoCloneUrl ? "clone" : "import",
	);
	const [importPath, setImportPath] = useState("");
	const [working, setWorking] = useState(false);
	const [setupError, setSetupError] = useState<CloneError | null>(null);
	const [ghAuthMode, setGhAuthMode] = useState<GhAuthDialogMode | null>(null);
	const [browseTarget, setBrowseTarget] = useState<
		"parentDir" | "importPath" | null
	>(null);

	useEffect(() => {
		if (!open) return;
		setMode(repoCloneUrl ? "clone" : "import");
	}, [open, repoCloneUrl]);

	const {
		parentDir,
		setParentDir,
		resetParentDir,
		access,
		isCheckingAccess,
		recheckAccess,
	} = useCloneAccessPlan({
		hostUrl,
		repoCloneUrl,
		enabled: open && mode === "clone",
	});

	const reset = () => {
		resetParentDir();
		setImportPath("");
		setWorking(false);
		setSetupError(null);
	};

	const handleOpenChange = (next: boolean) => {
		if (!next && working) return;
		if (!next) reset();
		onOpenChange(next);
	};

	const browseFor = async (
		title: string,
		target: "parentDir" | "importPath",
	) => {
		try {
			const result = await selectDirectory.mutateAsync({ title });
			if (result.canceled || !result.path) return;
			if (target === "parentDir") setParentDir(result.path);
			else setImportPath(result.path);
		} catch (err) {
			toast.error(errorMessage(err));
		}
	};

	const runClone = async () => {
		if (!hostUrl) {
			toast.error(
				t({
					message: `Host unavailable: ${hostName}`,
				}),
			);
			return;
		}
		const trimmed = parentDir.trim();
		if (!trimmed) {
			toast.error(
				isRemoteTarget
					? t({
							message: `Enter a parent directory on ${hostName}`,
						})
					: t({
							message: "Pick a parent directory",
						}),
			);
			return;
		}
		setWorking(true);
		setSetupError(null);
		try {
			const client = getHostServiceClientByUrl(hostUrl);
			const result = await client.project.setup.mutate({
				projectId,
				// Coordinates from the host fan-out: local-first projects created
				// on another host have no cloud row for the target host to read.
				origin: { repoCloneUrl, name: projectName },
				mode: { kind: "clone", parentDir: trimmed },
			});
			toast.success(
				t({
					message: `Cloned to ${result.repoPath}`,
				}),
			);
			if (result.mainWorkspaceId) {
				ensureWorkspaceInSidebar(result.mainWorkspaceId, projectId);
			} else {
				ensureProjectInSidebar(projectId);
			}
			onChanged?.();
			reset();
			onOpenChange(false);
		} catch (err) {
			setSetupError(classifyCloneError(err));
			// The access panel carries the remediation; refresh it so its state
			// (gh installed/signed in) matches what the clone just hit.
			recheckAccess();
		} finally {
			setWorking(false);
		}
	};

	const runImport = async () => {
		if (!hostUrl) {
			toast.error(
				t({
					message: `Host unavailable: ${hostName}`,
				}),
			);
			return;
		}
		const trimmed = importPath.trim();
		if (!trimmed) {
			toast.error(
				isRemoteTarget
					? t({
							message: `Enter a path on ${hostName}`,
						})
					: t({
							message: "Pick a project location",
						}),
			);
			return;
		}
		setWorking(true);
		setSetupError(null);
		try {
			const client = getHostServiceClientByUrl(hostUrl);
			const result = await client.project.setup.mutate({
				projectId,
				origin: { repoCloneUrl, name: projectName },
				mode: { kind: "import", repoPath: trimmed, allowRelocate: false },
			});
			toast.success(
				t({
					message: `Project set up at ${result.repoPath}`,
				}),
			);
			if (result.mainWorkspaceId) {
				ensureWorkspaceInSidebar(result.mainWorkspaceId, projectId);
			} else {
				ensureProjectInSidebar(projectId);
			}
			onChanged?.();
			reset();
			onOpenChange(false);
		} catch (err) {
			setSetupError({ message: errorMessage(err), needsGhAuth: false });
		} finally {
			setWorking(false);
		}
	};

	const submit = mode === "clone" ? runClone : runImport;
	const submitLabel =
		mode === "clone" ? <Trans>Clone</Trans> : <Trans>Import</Trans>;
	const cloneDisabled = !repoCloneUrl;
	// The access panel already explains gh-auth failures with remediation;
	// only show the raw error when it adds information.
	const showSetupError =
		setupError !== null &&
		!(mode === "clone" && setupError.needsGhAuth && access && !access.ok);

	return (
		<>
			<Dialog open={open} onOpenChange={handleOpenChange} modal>
				<DialogContent className="max-w-[480px]">
					<DialogHeader>
						<DialogTitle>
							<Trans>Set up project on {hostName}</Trans>
						</DialogTitle>
						<DialogDescription>
							<Trans>
								Clone the repository, or import an existing folder on the host.
							</Trans>
						</DialogDescription>
					</DialogHeader>

					<Tabs
						value={mode}
						onValueChange={(value) => {
							setMode(value as SetupMode);
							setSetupError(null);
						}}
					>
						<TabsList className="w-full">
							<TabsTrigger
								value="clone"
								disabled={cloneDisabled}
								className="flex-1"
							>
								<Trans>Clone</Trans>
							</TabsTrigger>
							<TabsTrigger value="import" className="flex-1">
								<Trans>Import existing</Trans>
							</TabsTrigger>
						</TabsList>

						<TabsContent value="clone" className="mt-4 space-y-3">
							{cloneDisabled ? (
								<p className="text-sm text-muted-foreground">
									<Trans>
										Link a GitHub repository on the project first to enable
										cloning.
									</Trans>
								</p>
							) : (
								<>
									{repoCloneUrl && (
										<div className="flex flex-col gap-1">
											<Label className="text-xs">
												<Trans>Repository</Trans>
											</Label>
											<p className="font-mono text-xs text-muted-foreground select-text cursor-text break-all">
												{repoCloneUrl}
											</p>
										</div>
									)}
									<CloneAccessStatus
										result={access}
										isChecking={isCheckingAccess}
										hostName={hostName}
										isRemoteTarget={isRemoteTarget}
										onRecheck={recheckAccess}
										onSignIn={
											isRemoteTarget ? undefined : (m) => setGhAuthMode(m)
										}
									/>
									<div className="flex flex-col gap-1.5">
										<Label htmlFor="setup-parent-dir" className="text-xs">
											{isRemoteTarget ? (
												<Trans>Parent directory on {hostName}</Trans>
											) : (
												<Trans>Parent directory</Trans>
											)}
										</Label>
										<div className="flex gap-1.5">
											<Input
												id="setup-parent-dir"
												value={parentDir}
												onChange={(e) => setParentDir(e.target.value)}
												placeholder={
													isRemoteTarget
														? "/home/user/projects"
														: t({
																message: "Pick a folder…",
															})
												}
												disabled={working}
												className="flex-1 font-mono text-sm"
												onKeyDown={(e) => {
													if (e.key === "Enter" && !working) void runClone();
												}}
											/>
											<Button
												type="button"
												variant="outline"
												size="icon"
												onClick={() => {
													if (isRemoteTarget) {
														setBrowseTarget("parentDir");
													} else {
														void browseFor(
															t({
																message:
																	"Select parent directory to clone into",
															}),
															"parentDir",
														);
													}
												}}
												disabled={working || selectDirectory.isPending}
												className="shrink-0"
												aria-label={t({
													message: "Browse for directory",
												})}
											>
												<LuFolderOpen className="size-4" />
											</Button>
										</div>
										<p className="text-xs text-muted-foreground">
											<Trans>
												The repository is cloned into a new folder inside this
												directory.
											</Trans>
										</p>
									</div>
								</>
							)}
						</TabsContent>

						<TabsContent value="import" className="mt-4 space-y-3">
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="setup-import-path" className="text-xs">
									{isRemoteTarget ? (
										<Trans>Existing repo path on {hostName}</Trans>
									) : (
										<Trans>Existing repo path</Trans>
									)}
								</Label>
								<div className="flex gap-1.5">
									<Input
										id="setup-import-path"
										value={importPath}
										onChange={(e) => setImportPath(e.target.value)}
										placeholder={
											isRemoteTarget
												? "/home/user/projects/my-repo"
												: t({
														message: "Pick a folder…",
													})
										}
										disabled={working}
										className="flex-1 font-mono text-sm"
										onKeyDown={(e) => {
											if (e.key === "Enter" && !working) void runImport();
										}}
									/>
									<Button
										type="button"
										variant="outline"
										size="icon"
										onClick={() => {
											if (isRemoteTarget) {
												setBrowseTarget("importPath");
											} else {
												void browseFor(
													t({
														message: "Select project location",
													}),
													"importPath",
												);
											}
										}}
										disabled={working || selectDirectory.isPending}
										className="shrink-0"
										aria-label={t({
											message: "Browse for directory",
										})}
									>
										<LuFolderOpen className="size-4" />
									</Button>
								</div>
							</div>
						</TabsContent>
					</Tabs>

					{showSetupError && setupError && (
						<div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
							<LuTriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
							<p className="min-w-0 flex-1 select-text cursor-text break-words text-xs text-destructive">
								{setupError.message}
							</p>
						</div>
					)}

					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => handleOpenChange(false)}
							disabled={working}
						>
							<Trans>Cancel</Trans>
						</Button>
						<Button
							type="button"
							onClick={() => void submit()}
							disabled={
								working || !hostUrl || (mode === "clone" && cloneDisabled)
							}
						>
							{working ? (
								<>
									<LuLoaderCircle className="size-4 animate-spin" />
									{submitLabel}…
								</>
							) : (
								submitLabel
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{!isRemoteTarget && (
				<GhAuthDialog
					open={ghAuthMode !== null}
					mode={ghAuthMode ?? "auth"}
					onOpenChange={(next) => {
						if (!next) setGhAuthMode(null);
					}}
					onExit={recheckAccess}
				/>
			)}

			<RemotePathPicker
				open={browseTarget !== null}
				onOpenChange={(next) => {
					if (!next) setBrowseTarget(null);
				}}
				hostUrl={hostUrl}
				hostName={hostName}
				initialPath={
					browseTarget === "parentDir"
						? parentDir || undefined
						: browseTarget === "importPath"
							? importPath || undefined
							: undefined
				}
				title={
					browseTarget === "parentDir"
						? t({
								message: "Choose a parent directory",
							})
						: t({
								message: "Choose an existing repo folder",
							})
				}
				confirmLabel={
					browseTarget === "parentDir"
						? t({
								message: "Use this folder",
							})
						: t({
								message: "Use this repo",
							})
				}
				onPick={(path) => {
					if (browseTarget === "parentDir") setParentDir(path);
					else if (browseTarget === "importPath") setImportPath(path);
				}}
			/>
		</>
	);
}

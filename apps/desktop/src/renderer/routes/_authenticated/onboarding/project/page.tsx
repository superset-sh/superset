import { Button } from "@superset/ui/button";
import { Card } from "@superset/ui/card";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useState } from "react";
import {
	LuFolderOpen,
	LuFolderPlus,
	LuGitBranch,
	LuLayoutTemplate,
} from "react-icons/lu";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { track } from "renderer/lib/analytics";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	useCreateV1Project,
	useFinalizeProjectSetup,
	useOpenProject,
} from "renderer/react-query/projects";
import { useOpenMainRepoWorkspace } from "renderer/react-query/workspaces";
import { useFolderFirstImport } from "renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/hooks/useFolderFirstImport";
import { EmptyProjectModal } from "renderer/routes/_authenticated/components/EmptyProjectModal";
import { TemplateGalleryModal } from "renderer/routes/_authenticated/components/TemplateGalleryModal";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import { GhAuthDialog } from "../components/GhAuthDialog";

export const Route = createFileRoute("/_authenticated/onboarding/project/")({
	component: OnboardingProjectPage,
});

interface CloneError {
	message: string;
	needsGhAuth: boolean;
}

const GH_AUTH_FAILURE_PATTERNS = [
	"Repository not found",
	"Authentication failed",
	"could not read Username",
];

function toCloneError(err: unknown): CloneError {
	const message =
		err instanceof Error ? err.message : "Failed to clone repository";
	if (message.includes("Permission denied (publickey)")) {
		return {
			message:
				"SSH authentication failed — sign in to GitHub CLI and use the HTTPS URL instead.",
			needsGhAuth: true,
		};
	}
	if (GH_AUTH_FAILURE_PATTERNS.some((pattern) => message.includes(pattern))) {
		return {
			message:
				"Couldn't access this repository — if it's private, sign in to GitHub CLI first.",
			needsGhAuth: true,
		};
	}
	return { message, needsGhAuth: false };
}

function OnboardingProjectPage() {
	const navigate = useNavigate();
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const { refetch: refetchSession } = authClient.useSession();
	const { waitForHostReady } = useLocalHostService();
	const openNewWorkspaceModal = useOpenNewWorkspaceModal();
	const { data: homeDir } = electronTrpc.window.getHomeDir.useQuery();
	const cloneTargetDir = homeDir ? `${homeDir}/.superset/projects` : null;
	const [url, setUrl] = useState("");
	const [busy, setBusy] = useState(false);
	const [cloneError, setCloneError] = useState<CloneError | null>(null);
	const [ghAuthOpen, setGhAuthOpen] = useState(false);
	const [emptyProjectOpen, setEmptyProjectOpen] = useState(false);
	const [templateOpen, setTemplateOpen] = useState(false);

	const folderImport = useFolderFirstImport({
		onError: (message) => toast.error(message),
	});
	const finalizeSetup = useFinalizeProjectSetup();
	const openProject = useOpenProject();
	const createV1Project = useCreateV1Project();
	const openMainRepoWorkspace = useOpenMainRepoWorkspace();
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();

	// Adding a project finishes onboarding: mark onboarded, then hand off to the
	// dashboard's new-workspace modal pre-selected to the project just added.
	const finish = async (projectId: string) => {
		track("onboarding_finished", { outcome: "completed" });
		try {
			await apiTrpcClient.user.completeOnboarding.mutate();
			// Reactive refetch (not imperative getSession) so the layout guards'
			// useSession() sees onboardedAt before we navigate — otherwise the
			// _authenticated guard bounces /v2-workspaces back to /onboarding.
			await refetchSession({ query: { disableCookieCache: true } });
		} catch (error) {
			console.error("[onboarding] completeOnboarding failed", error);
			toast.error("Could not finish onboarding. Please try again.");
			return;
		}
		if (isV2CloudEnabled) {
			// Land on the dashboard first, then open the modal. Opening it in the
			// same tick as navigate mounts the Dialog mid-route-transition, which
			// thrashes Radix's ref composition into a "Maximum update depth" loop.
			await navigate({ to: "/v2-workspaces", replace: true });
			openNewWorkspaceModal(projectId);
			return;
		}
		try {
			await openMainRepoWorkspace.mutateAsync({ projectId });
		} catch (error) {
			console.error("[onboarding] open main workspace failed", error);
			await navigate({ to: "/workspaces", replace: true });
		}
	};

	const handleOpenFolder = async () => {
		if (isV2CloudEnabled) {
			setBusy(true);
			try {
				const result = await folderImport.start();
				if (result) await finish(result.projectId);
			} finally {
				setBusy(false);
			}
			return;
		}
		setBusy(true);
		try {
			const picked = await selectDirectory.mutateAsync({
				title: "Open a folder",
			});
			if (picked.canceled || !picked.path) return;
			const project = await openProject.openFromPath(picked.path);
			if (project) await finish(project.id);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to open folder");
		} finally {
			setBusy(false);
		}
	};

	const handleClone = async (e: FormEvent) => {
		e.preventDefault();
		const trimmed = url.trim();
		if (!trimmed || !cloneTargetDir) return;
		setBusy(true);
		setCloneError(null);
		try {
			if (isV2CloudEnabled) {
				const activeHostUrl = await waitForHostReady();
				if (!activeHostUrl) {
					setCloneError({
						message: "Local host service isn't ready yet. Please try again.",
						needsGhAuth: false,
					});
					return;
				}
				const hostService = getHostServiceClientByUrl(activeHostUrl);
				let created: Awaited<
					ReturnType<typeof hostService.project.create.mutate>
				>;
				try {
					created = await hostService.project.create.mutate({
						name: repoNameFromUrl(trimmed),
						mode: { kind: "clone", parentDir: cloneTargetDir, url: trimmed },
					});
				} catch (err) {
					setCloneError(toCloneError(err));
					return;
				}
				finalizeSetup(activeHostUrl, created);
				await finish(created.projectId);
			} else {
				let projectId: string | null;
				try {
					projectId = await createV1Project.cloneFromUrl({
						url: trimmed,
						parentDir: cloneTargetDir,
					});
				} catch (err) {
					setCloneError(toCloneError(err));
					return;
				}
				if (projectId) await finish(projectId);
			}
		} catch (err) {
			// Non-clone failures (setup, navigation) get the raw message, no gh advice.
			setCloneError({
				message:
					err instanceof Error
						? err.message
						: "Something went wrong. Please try again.",
				needsGhAuth: false,
			});
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="flex flex-col gap-3">
			<Card className="flex-row items-center gap-4 p-5">
				<ProjectIcon icon={<LuFolderPlus className="size-4.5" />} />
				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium text-foreground">
						Create a new project
					</p>
					<p className="text-xs text-muted-foreground">
						Start from scratch in a new folder.
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={() => setEmptyProjectOpen(true)}
					disabled={busy}
				>
					Create
				</Button>
			</Card>

			<Card className="flex-row items-center gap-4 p-5">
				<ProjectIcon icon={<LuFolderOpen className="size-4.5" />} />
				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium text-foreground">Open a folder</p>
					<p className="text-xs text-muted-foreground">
						Choose any local directory, git repo or not.
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={handleOpenFolder}
					disabled={busy}
				>
					Browse…
				</Button>
			</Card>

			<Card className="gap-4 p-5">
				<div className="flex items-center gap-4">
					<ProjectIcon icon={<LuGitBranch className="size-4.5" />} />
					<div className="min-w-0 flex-1">
						<p className="text-sm font-medium text-foreground">Clone a repo</p>
						<p className="text-xs text-muted-foreground">
							Paste an HTTPS or SSH URL.
						</p>
					</div>
				</div>
				<form onSubmit={handleClone} className="flex items-center gap-2">
					<Input
						type="text"
						placeholder="https://github.com/org/repo.git"
						value={url}
						onChange={(e) => {
							setUrl(e.target.value);
							if (cloneError) setCloneError(null);
						}}
						disabled={busy}
						className="flex-1"
					/>
					<Button
						type="submit"
						disabled={!url.trim() || busy || !cloneTargetDir}
					>
						{busy ? "Cloning…" : "Clone"}
					</Button>
				</form>
				{cloneError && (
					<div role="alert" className="flex flex-col items-start gap-2">
						<p className="select-text cursor-text break-words text-xs text-destructive">
							{cloneError.message}
						</p>
						{cloneError.needsGhAuth && (
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => setGhAuthOpen(true)}
							>
								Sign in to GitHub CLI
							</Button>
						)}
					</div>
				)}
			</Card>

			<Card className="flex-row items-center gap-4 p-5">
				<ProjectIcon icon={<LuLayoutTemplate className="size-4.5" />} />
				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium text-foreground">
						Start from a template
					</p>
					<p className="text-xs text-muted-foreground">
						Scaffold a new project from a starter like gstack.
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={() => setTemplateOpen(true)}
					disabled={busy}
				>
					Browse…
				</Button>
			</Card>

			<TemplateGalleryModal
				open={templateOpen}
				onOpenChange={setTemplateOpen}
				onCreated={(result) => {
					setTemplateOpen(false);
					finish(result.projectId);
				}}
			/>
			<EmptyProjectModal
				open={emptyProjectOpen}
				onOpenChange={setEmptyProjectOpen}
				onSuccess={(result) => {
					setEmptyProjectOpen(false);
					finish(result.projectId);
				}}
			/>
			<GhAuthDialog
				open={ghAuthOpen}
				mode="auth"
				onOpenChange={setGhAuthOpen}
				onExit={() => setGhAuthOpen(false)}
			/>
		</div>
	);
}

function repoNameFromUrl(url: string): string {
	const lastSegment = url
		.trim()
		.replace(/\.git$/, "")
		.replace(/[/:]+$/, "")
		.split(/[/:]/)
		.pop();
	return lastSegment || "repo";
}

function ProjectIcon({ icon }: { icon: ReactNode }) {
	return (
		<div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
			{icon}
		</div>
	);
}

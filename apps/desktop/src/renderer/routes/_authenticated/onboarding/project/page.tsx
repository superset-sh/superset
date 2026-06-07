import { Button } from "@superset/ui/button";
import { Card } from "@superset/ui/card";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useState } from "react";
import { LuFolderOpen, LuGitBranch } from "react-icons/lu";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { track } from "renderer/lib/analytics";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useFinalizeProjectSetup } from "renderer/react-query/projects";
import { useFolderFirstImport } from "renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/hooks/useFolderFirstImport";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";

export const Route = createFileRoute("/_authenticated/onboarding/project/")({
	component: OnboardingProjectPage,
});

function OnboardingProjectPage() {
	const navigate = useNavigate();
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const { refetch: refetchSession } = authClient.useSession();
	const { activeHostUrl } = useLocalHostService();
	const hostReady = activeHostUrl !== null;
	const openNewWorkspaceModal = useOpenNewWorkspaceModal();
	const { data: homeDir } = electronTrpc.window.getHomeDir.useQuery();
	const cloneTargetDir = homeDir ? `${homeDir}/.superset/projects` : null;
	const [url, setUrl] = useState("");
	const [busy, setBusy] = useState(false);

	const folderImport = useFolderFirstImport({
		onError: (message) => toast.error(message),
	});
	const finalizeSetup = useFinalizeProjectSetup();

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
		// Land on the dashboard first, then open the modal. Opening it in the same
		// tick as navigate mounts the Dialog mid-route-transition, which thrashes
		// Radix's ref composition into a "Maximum update depth" loop.
		await navigate({
			to: isV2CloudEnabled ? "/v2-workspaces" : "/workspaces",
			replace: true,
		});
		openNewWorkspaceModal(projectId);
	};

	const handleOpenFolder = async () => {
		const result = await folderImport.start();
		if (result) {
			setBusy(true);
			await finish(result.projectId);
			setBusy(false);
		}
	};

	const handleClone = async (e: FormEvent) => {
		e.preventDefault();
		const trimmed = url.trim();
		if (!trimmed || !cloneTargetDir || !activeHostUrl) return;
		setBusy(true);
		try {
			const hostService = getHostServiceClientByUrl(activeHostUrl);
			const created = await hostService.project.create.mutate({
				name: repoNameFromUrl(trimmed),
				mode: { kind: "clone", parentDir: cloneTargetDir, url: trimmed },
			});
			finalizeSetup(activeHostUrl, created);
			await finish(created.projectId);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to clone repository",
			);
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="flex flex-col gap-3">
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
					disabled={!hostReady || busy}
				>
					{hostReady ? "Browse…" : "Connecting…"}
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
						placeholder="git@github.com:org/repo.git"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						disabled={busy || !hostReady}
						className="flex-1"
					/>
					<Button
						type="submit"
						disabled={!url.trim() || busy || !hostReady || !cloneTargetDir}
					>
						{busy ? "Cloning…" : "Clone"}
					</Button>
				</form>
			</Card>
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

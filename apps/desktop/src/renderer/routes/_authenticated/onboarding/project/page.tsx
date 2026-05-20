import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { LuFolderOpen, LuGitBranch } from "react-icons/lu";
import { useEnsureV2Project } from "renderer/hooks/useEnsureV2Project";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useFolderFirstImport } from "renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/hooks/useFolderFirstImport";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { StepHeader, StepShell } from "../components/StepShell";

export const Route = createFileRoute("/_authenticated/onboarding/project/")({
	component: OnboardingProjectPage,
});

type Mode = "folder" | "url";

function OnboardingProjectPage() {
	const navigate = useNavigate();
	const { activeHostUrl } = useLocalHostService();
	const hostReady = activeHostUrl !== null;
	const [mode, setMode] = useState<Mode>("folder");

	const folderImport = useFolderFirstImport({
		onError: (message) => toast.error(message),
	});
	const cloneRepo = electronTrpc.projects.cloneRepo.useMutation();
	const ensureV2Project = useEnsureV2Project();
	const [url, setUrl] = useState("");
	const [submitting, setSubmitting] = useState(false);

	const goToPrompt = (projectId: string) => {
		navigate({
			to: "/onboarding/prompt/$projectId",
			params: { projectId },
		});
	};

	const handleOpenFolder = async () => {
		const result = await folderImport.start();
		if (result) goToPrompt(result.projectId);
	};

	const handleCloneUrl = async (e: FormEvent) => {
		e.preventDefault();
		const trimmed = url.trim();
		if (!trimmed) return;
		setSubmitting(true);
		try {
			const cloneResult = await cloneRepo.mutateAsync({ url: trimmed });
			if (cloneResult.canceled) return;
			if (!cloneResult.success || !cloneResult.project) {
				toast.error(cloneResult.error ?? "Failed to clone repository");
				return;
			}
			const ensured = await ensureV2Project({
				repoPath: cloneResult.project.mainRepoPath,
				name: cloneResult.project.name,
			});
			goToPrompt(ensured.projectId);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to clone repository",
			);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<StepShell maxWidth="lg">
			<StepHeader
				title="Add a project"
				subtitle="Open a local folder or clone a remote repository."
			/>

			<div className="grid grid-cols-2 gap-2">
				<ModeButton
					selected={mode === "folder"}
					onClick={() => setMode("folder")}
					icon={<LuFolderOpen className="size-4" />}
					label="Open folder"
				/>
				<ModeButton
					selected={mode === "url"}
					onClick={() => setMode("url")}
					icon={<LuGitBranch className="size-4" />}
					label="Clone from URL"
				/>
			</div>

			{mode === "folder" ? (
				<div className="flex flex-col gap-2 self-center">
					<Button
						size="sm"
						className="w-[273px]"
						onClick={handleOpenFolder}
						disabled={!hostReady}
					>
						{hostReady ? "Choose a folder" : "Connecting…"}
					</Button>
					<p className="text-center text-xs text-muted-foreground">
						Pick any folder with a <span className="font-mono">.git</span>{" "}
						directory.
					</p>
				</div>
			) : (
				<form
					onSubmit={handleCloneUrl}
					className="flex w-[420px] flex-col gap-3 self-center"
				>
					<Input
						type="text"
						placeholder="https://github.com/user/repo.git"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						disabled={submitting || !hostReady}
						autoFocus
					/>
					<Button
						type="submit"
						size="sm"
						disabled={!url.trim() || submitting || !hostReady}
					>
						{submitting
							? "Cloning…"
							: hostReady
								? "Clone repository"
								: "Connecting…"}
					</Button>
				</form>
			)}
		</StepShell>
	);
}

function ModeButton({
	selected,
	onClick,
	icon,
	label,
}: {
	selected: boolean;
	onClick: () => void;
	icon: React.ReactNode;
	label: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
				selected
					? "border-foreground bg-accent text-foreground"
					: "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
			)}
		>
			{icon}
			{label}
		</button>
	);
}

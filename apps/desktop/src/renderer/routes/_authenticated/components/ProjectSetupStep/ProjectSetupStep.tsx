import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { RadioGroup, RadioGroupItem } from "@superset/ui/radio-group";
import { useCallback, useState } from "react";
import { HiCheck, HiXMark } from "react-icons/hi2";
import { LuFolderOpen, LuLoader } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

type SetupMode = "import" | "clone";

interface ProjectSetupStepProps {
	projectId: string;
	projectName: string;
	hostUrl: string;
	onSetupComplete: () => void;
	submitLabel?: string;
}

export function ProjectSetupStep({
	projectId,
	projectName,
	hostUrl,
	onSetupComplete,
	submitLabel = "Set Up & Create Workspace",
}: ProjectSetupStepProps) {
	const [mode, setMode] = useState<SetupMode>("import");
	const [localPath, setLocalPath] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [validationStatus, setValidationStatus] = useState<
		"idle" | "valid" | "invalid"
	>("idle");

	const selectDirectory = electronTrpc.projects.selectDirectory.useMutation();

	const handleBrowse = useCallback(() => {
		selectDirectory.mutate(
			{ defaultPath: localPath || undefined },
			{
				onSuccess: (result) => {
					if (!result.canceled && result.path) {
						setLocalPath(result.path);
						setValidationStatus("idle");
						setError(null);
					}
				},
			},
		);
	}, [localPath, selectDirectory]);

	const handleSubmit = useCallback(async () => {
		if (!localPath.trim()) return;

		setIsSubmitting(true);
		setError(null);

		try {
			const client = getHostServiceClientByUrl(hostUrl);
			await client.project.setup.mutate({
				projectId,
				mode,
				localPath: localPath.trim(),
			});
			setValidationStatus("valid");
			onSetupComplete();
		} catch (err) {
			setValidationStatus("invalid");
			const message = err instanceof Error ? err.message : "Setup failed";
			setError(message);
		} finally {
			setIsSubmitting(false);
		}
	}, [hostUrl, localPath, mode, onSetupComplete, projectId]);

	return (
		<div className="space-y-4">
			<div className="space-y-1">
				<h3 className="text-sm font-medium">
					Set up &ldquo;{projectName}&rdquo; on this device
				</h3>
				<p className="text-xs text-muted-foreground">
					Point to an existing checkout or clone the repository.
				</p>
			</div>

			<RadioGroup
				value={mode}
				onValueChange={(v) => {
					setMode(v as SetupMode);
					setLocalPath("");
					setValidationStatus("idle");
					setError(null);
				}}
			>
				<div className="flex items-center gap-2">
					<RadioGroupItem value="import" id="mode-import" />
					<Label htmlFor="mode-import" className="text-sm cursor-pointer">
						Use existing directory
					</Label>
				</div>
				<div className="flex items-center gap-2">
					<RadioGroupItem value="clone" id="mode-clone" />
					<Label htmlFor="mode-clone" className="text-sm cursor-pointer">
						Clone repository
					</Label>
				</div>
			</RadioGroup>

			<div className="space-y-2">
				<Label className="text-xs text-muted-foreground">
					{mode === "import" ? "Repository path" : "Clone destination"}
				</Label>
				<div className="flex gap-2">
					<Input
						value={localPath}
						onChange={(e) => {
							setLocalPath(e.target.value);
							setValidationStatus("idle");
							setError(null);
						}}
						placeholder={mode === "import" ? "~/work/my-project" : "~/work"}
						className="flex-1 font-mono text-xs"
					/>
					<Button
						type="button"
						variant="outline"
						size="icon"
						onClick={handleBrowse}
						disabled={selectDirectory.isPending}
						className="shrink-0"
						aria-label="Browse for directory"
					>
						<LuFolderOpen className="size-4" />
					</Button>
				</div>
			</div>

			{validationStatus === "valid" && (
				<div className="flex items-center gap-1.5 text-xs text-emerald-500">
					<HiCheck className="size-3.5" />
					<span>Repository matched and linked</span>
				</div>
			)}

			{error && (
				<div className="flex items-start gap-1.5 text-xs text-destructive">
					<HiXMark className="size-3.5 mt-0.5 shrink-0" />
					<span>{error}</span>
				</div>
			)}

			<Button
				onClick={handleSubmit}
				disabled={!localPath.trim() || isSubmitting}
				className="w-full"
				size="sm"
			>
				{isSubmitting ? (
					<>
						<LuLoader className="size-3.5 animate-spin mr-1.5" />
						Setting up...
					</>
				) : (
					submitLabel
				)}
			</Button>
		</div>
	);
}

import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useCallback, useEffect, useState } from "react";
import { HiArrowTopRightOnSquare, HiDocumentArrowUp } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { EXTERNAL_LINKS } from "shared/constants";

interface ScriptsEditorProps {
	projectId: string;
	className?: string;
}

function parseContentFromConfig(content: string | null): {
	setup: string;
	teardown: string;
} {
	if (!content) {
		return { setup: "", teardown: "" };
	}

	try {
		const parsed = JSON.parse(content);
		return {
			setup: (parsed.setup ?? []).join("\n"),
			teardown: (parsed.teardown ?? []).join("\n"),
		};
	} catch {
		return { setup: "", teardown: "" };
	}
}

interface ScriptTextareaProps {
	title: string;
	description: string;
	placeholder: string;
	value: string;
	onChange: (value: string) => void;
	onImportFile: () => void;
}

function ScriptTextarea({
	title,
	description,
	placeholder,
	value,
	onChange,
	onImportFile,
}: ScriptTextareaProps) {
	const [isDragOver, setIsDragOver] = useState(false);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(true);
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(false);
	}, []);

	const handleDrop = useCallback(
		async (e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			setIsDragOver(false);

			const files = Array.from(e.dataTransfer.files);
			const scriptFile = files.find((f) =>
				f.name.match(/\.(sh|bash|zsh|command)$/i),
			);

			if (scriptFile) {
				const filePath = window.webUtils.getPathForFile(scriptFile);
				if (filePath) {
					try {
						const response = await window.ipcRenderer.invoke(
							"read-script-file",
							filePath,
						);
						if (response && typeof response === "string") {
							onChange(response);
						}
					} catch (error) {
						console.error(
							"[scripts/import] Failed to read dropped file:",
							error,
						);
					}
				}
			}
		},
		[onChange],
	);

	return (
		<div className="space-y-2">
			<div>
				<h4 className="text-sm font-medium">{title}</h4>
				<p className="text-xs text-muted-foreground mt-0.5">{description}</p>
			</div>

			{/* biome-ignore lint/a11y/useSemanticElements: Drop zone wrapper for drag-and-drop functionality */}
			<div
				role="region"
				aria-label={`${title} script editor with file drop support`}
				className={cn(
					"relative rounded-lg border transition-colors",
					isDragOver
						? "border-primary bg-primary/5"
						: "border-border hover:border-border/80",
				)}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
			>
				<textarea
					value={value}
					onChange={(e) => onChange(e.target.value)}
					placeholder={placeholder}
					className="w-full min-h-[80px] p-3 text-sm font-mono bg-transparent resize-y focus:outline-none focus:ring-1 focus:ring-ring rounded-lg"
					rows={3}
				/>
				{isDragOver && (
					<div className="absolute inset-0 flex items-center justify-center bg-primary/10 rounded-lg pointer-events-none">
						<div className="flex items-center gap-2 text-primary text-sm font-medium">
							<HiDocumentArrowUp className="h-5 w-5" />
							Drop to import
						</div>
					</div>
				)}
			</div>

			<Button
				variant="ghost"
				size="sm"
				onClick={onImportFile}
				className="gap-1.5 text-muted-foreground"
			>
				<HiDocumentArrowUp className="h-3.5 w-3.5" />
				Import file
			</Button>
		</div>
	);
}

export function ScriptsEditor({ projectId, className }: ScriptsEditorProps) {
	const utils = electronTrpc.useUtils();

	const { data: configData, isLoading } =
		electronTrpc.config.getConfigContent.useQuery(
			{ projectId },
			{ enabled: !!projectId },
		);

	const [setupContent, setSetupContent] = useState("");
	const [teardownContent, setTeardownContent] = useState("");
	const [hasChanges, setHasChanges] = useState(false);

	useEffect(() => {
		if (configData?.content) {
			const parsed = parseContentFromConfig(configData.content);
			setSetupContent(parsed.setup);
			setTeardownContent(parsed.teardown);
			setHasChanges(false);
		}
	}, [configData?.content]);

	const updateConfigMutation = electronTrpc.config.updateConfig.useMutation({
		onSuccess: () => {
			setHasChanges(false);
			utils.config.getConfigContent.invalidate({ projectId });
			utils.config.shouldShowSetupCard.invalidate({ projectId });
		},
	});

	const handleSetupChange = useCallback((value: string) => {
		setSetupContent(value);
		setHasChanges(true);
	}, []);

	const handleTeardownChange = useCallback((value: string) => {
		setTeardownContent(value);
		setHasChanges(true);
	}, []);

	const handleImportFile = useCallback(
		async (setter: (value: string) => void) => {
			try {
				const result = await window.ipcRenderer.invoke("open-file-dialog", {
					filters: [{ name: "Scripts", extensions: ["sh", "bash", "zsh"] }],
				});
				if (result && typeof result === "string") {
					const content = await window.ipcRenderer.invoke(
						"read-script-file",
						result,
					);
					if (content && typeof content === "string") {
						setter(content);
						setHasChanges(true);
					}
				}
			} catch (error) {
				console.error("[scripts/import] Failed to import file:", error);
			}
		},
		[],
	);

	const handleImportSetupFile = useCallback(
		() => handleImportFile(setSetupContent),
		[handleImportFile],
	);

	const handleImportTeardownFile = useCallback(
		() => handleImportFile(setTeardownContent),
		[handleImportFile],
	);

	const handleSave = useCallback(() => {
		const setup = setupContent.trim() ? [setupContent.trim()] : [];
		const teardown = teardownContent.trim() ? [teardownContent.trim()] : [];

		updateConfigMutation.mutate({ projectId, setup, teardown });
	}, [projectId, setupContent, teardownContent, updateConfigMutation]);

	if (isLoading) {
		return (
			<div className={cn("space-y-4", className)}>
				<div className="h-24 bg-muted/30 rounded-lg animate-pulse" />
			</div>
		);
	}

	return (
		<div className={cn("space-y-5", className)}>
			<div className="flex items-start justify-between">
				<div className="space-y-1">
					<h3 className="text-base font-semibold text-foreground">Scripts</h3>
					<p className="text-sm text-muted-foreground">
						Automate your workspace lifecycle with setup and teardown scripts.
					</p>
				</div>
				<div className="flex gap-2 shrink-0">
					<Button variant="outline" size="sm" asChild>
						<a
							href={EXTERNAL_LINKS.SETUP_TEARDOWN_SCRIPTS}
							target="_blank"
							rel="noopener noreferrer"
						>
							Get started with setup scripts
							<HiArrowTopRightOnSquare className="h-3.5 w-3.5" />
						</a>
					</Button>
					{hasChanges && (
						<Button
							size="sm"
							onClick={handleSave}
							disabled={updateConfigMutation.isPending}
						>
							{updateConfigMutation.isPending ? "Saving..." : "Save"}
						</Button>
					)}
				</div>
			</div>

			<ScriptTextarea
				title="Setup"
				description="Runs when a new workspace is created."
				placeholder="e.g. bun install && bun run dev"
				value={setupContent}
				onChange={handleSetupChange}
				onImportFile={handleImportSetupFile}
			/>

			<ScriptTextarea
				title="Teardown"
				description="Runs when a workspace is deleted."
				placeholder="e.g. docker compose down"
				value={teardownContent}
				onChange={handleTeardownChange}
				onImportFile={handleImportTeardownFile}
			/>
		</div>
	);
}

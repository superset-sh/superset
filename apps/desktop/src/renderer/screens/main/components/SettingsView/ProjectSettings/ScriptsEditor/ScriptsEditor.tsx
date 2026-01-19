import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useCallback, useEffect, useState } from "react";
import {
	HiArrowTopRightOnSquare,
	HiDocumentArrowUp,
	HiPlus,
	HiXMark,
} from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { EXTERNAL_LINKS } from "shared/constants";

interface ScriptEntry {
	id: string;
	content: string;
}

interface ScriptsEditorProps {
	projectId: string;
	projectName: string;
	className?: string;
}

function generateId(): string {
	return Math.random().toString(36).substring(2, 9);
}

function parseScriptsFromConfig(content: string | null): {
	setup: ScriptEntry[];
	teardown: ScriptEntry[];
} {
	if (!content) {
		return { setup: [], teardown: [] };
	}

	try {
		const parsed = JSON.parse(content);
		return {
			setup: (parsed.setup ?? []).map((s: string) => ({
				id: generateId(),
				content: s,
			})),
			teardown: (parsed.teardown ?? []).map((s: string) => ({
				id: generateId(),
				content: s,
			})),
		};
	} catch {
		return { setup: [], teardown: [] };
	}
}

interface ScriptEntryRowProps {
	script: ScriptEntry;
	onChange: (id: string, content: string) => void;
	onRemove: (id: string) => void;
	onFileDrop: (id: string, content: string) => void;
}

function ScriptEntryRow({
	script,
	onChange,
	onRemove,
	onFileDrop,
}: ScriptEntryRowProps) {
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
							onFileDrop(script.id, response);
						}
					} catch (error) {
						console.error("Failed to read script file:", error);
					}
				}
			}
		},
		[script.id, onFileDrop],
	);

	return (
		// biome-ignore lint/a11y/useSemanticElements: Drop zone wrapper for drag-and-drop functionality
		<div
			role="region"
			aria-label="Script editor with file drop support"
			className={cn(
				"relative group rounded-lg border transition-colors",
				isDragOver
					? "border-primary bg-primary/5"
					: "border-border hover:border-border/80",
			)}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
		>
			<textarea
				value={script.content}
				onChange={(e) => onChange(script.id, e.target.value)}
				placeholder="#!/bin/bash&#10;# Your script here..."
				className="w-full min-h-[100px] p-3 pr-10 text-sm font-mono bg-transparent resize-y focus:outline-none focus:ring-1 focus:ring-ring rounded-lg"
				rows={4}
			/>
			<button
				type="button"
				onClick={() => onRemove(script.id)}
				className="absolute top-2 right-2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity"
				title="Remove script"
			>
				<HiXMark className="h-4 w-4" />
			</button>
			{isDragOver && (
				<div className="absolute inset-0 flex items-center justify-center bg-primary/10 rounded-lg pointer-events-none">
					<div className="flex items-center gap-2 text-primary text-sm font-medium">
						<HiDocumentArrowUp className="h-5 w-5" />
						Drop to import
					</div>
				</div>
			)}
		</div>
	);
}

interface ScriptsSectionProps {
	title: string;
	description: string;
	scripts: ScriptEntry[];
	onChange: (id: string, content: string) => void;
	onAdd: () => void;
	onRemove: (id: string) => void;
	onFileDrop: (id: string, content: string) => void;
	onImportFile: () => void;
}

function ScriptsSection({
	title,
	description,
	scripts,
	onChange,
	onAdd,
	onRemove,
	onFileDrop,
	onImportFile,
}: ScriptsSectionProps) {
	return (
		<div className="space-y-3">
			<div>
				<h4 className="text-sm font-medium">{title}</h4>
				<p className="text-xs text-muted-foreground mt-0.5">{description}</p>
			</div>

			{scripts.length > 0 ? (
				<div className="space-y-3">
					{scripts.map((script) => (
						<ScriptEntryRow
							key={script.id}
							script={script}
							onChange={onChange}
							onRemove={onRemove}
							onFileDrop={onFileDrop}
						/>
					))}
				</div>
			) : (
				<div className="text-sm text-muted-foreground italic">
					No scripts configured
				</div>
			)}

			<div className="flex gap-2">
				<Button variant="outline" size="sm" onClick={onAdd} className="gap-1.5">
					<HiPlus className="h-4 w-4" />
					Add Script
				</Button>
				<Button
					variant="ghost"
					size="sm"
					onClick={onImportFile}
					className="gap-1.5"
				>
					<HiDocumentArrowUp className="h-4 w-4" />
					Import File
				</Button>
			</div>
		</div>
	);
}

export function ScriptsEditor({
	projectId,
	projectName,
	className,
}: ScriptsEditorProps) {
	const utils = electronTrpc.useUtils();

	const { data: configData, isLoading } =
		electronTrpc.config.getConfigContent.useQuery(
			{ projectId },
			{ enabled: !!projectId },
		);

	const [setupScripts, setSetupScripts] = useState<ScriptEntry[]>([]);
	const [teardownScripts, setTeardownScripts] = useState<ScriptEntry[]>([]);
	const [hasChanges, setHasChanges] = useState(false);

	// Initialize scripts from config
	useEffect(() => {
		if (configData?.content) {
			const parsed = parseScriptsFromConfig(configData.content);
			setSetupScripts(parsed.setup);
			setTeardownScripts(parsed.teardown);
			setHasChanges(false);
		}
	}, [configData?.content]);

	const updateConfigMutation = electronTrpc.config.updateConfig.useMutation({
		onSuccess: () => {
			setHasChanges(false);
			utils.config.getConfigContent.invalidate({ projectId });
		},
	});

	const handleSetupChange = useCallback((id: string, content: string) => {
		setSetupScripts((prev) =>
			prev.map((s) => (s.id === id ? { ...s, content } : s)),
		);
		setHasChanges(true);
	}, []);

	const handleTeardownChange = useCallback((id: string, content: string) => {
		setTeardownScripts((prev) =>
			prev.map((s) => (s.id === id ? { ...s, content } : s)),
		);
		setHasChanges(true);
	}, []);

	const handleAddSetup = useCallback(() => {
		setSetupScripts((prev) => [...prev, { id: generateId(), content: "" }]);
		setHasChanges(true);
	}, []);

	const handleAddTeardown = useCallback(() => {
		setTeardownScripts((prev) => [...prev, { id: generateId(), content: "" }]);
		setHasChanges(true);
	}, []);

	const handleRemoveSetup = useCallback((id: string) => {
		setSetupScripts((prev) => prev.filter((s) => s.id !== id));
		setHasChanges(true);
	}, []);

	const handleRemoveTeardown = useCallback((id: string) => {
		setTeardownScripts((prev) => prev.filter((s) => s.id !== id));
		setHasChanges(true);
	}, []);

	const handleFileDropSetup = useCallback((id: string, content: string) => {
		setSetupScripts((prev) =>
			prev.map((s) => (s.id === id ? { ...s, content } : s)),
		);
		setHasChanges(true);
	}, []);

	const handleFileDropTeardown = useCallback((id: string, content: string) => {
		setTeardownScripts((prev) =>
			prev.map((s) => (s.id === id ? { ...s, content } : s)),
		);
		setHasChanges(true);
	}, []);

	const handleImportSetupFile = useCallback(async () => {
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
					setSetupScripts((prev) => [...prev, { id: generateId(), content }]);
					setHasChanges(true);
				}
			}
		} catch (error) {
			console.error("Failed to import file:", error);
		}
	}, []);

	const handleImportTeardownFile = useCallback(async () => {
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
					setTeardownScripts((prev) => [
						...prev,
						{ id: generateId(), content },
					]);
					setHasChanges(true);
				}
			}
		} catch (error) {
			console.error("Failed to import file:", error);
		}
	}, []);

	const handleSave = useCallback(() => {
		const setup = setupScripts
			.map((s) => s.content.trim())
			.filter((s) => s.length > 0);
		const teardown = teardownScripts
			.map((s) => s.content.trim())
			.filter((s) => s.length > 0);

		updateConfigMutation.mutate({ projectId, setup, teardown });
	}, [projectId, setupScripts, teardownScripts, updateConfigMutation]);

	const handleLearnMore = () => {
		window.open(EXTERNAL_LINKS.SETUP_TEARDOWN_SCRIPTS, "_blank");
	};

	if (isLoading) {
		return (
			<div className={cn("space-y-4", className)}>
				<div className="h-32 bg-muted/30 rounded-lg animate-pulse" />
				<div className="h-32 bg-muted/30 rounded-lg animate-pulse" />
			</div>
		);
	}

	return (
		<div className={cn("space-y-6", className)}>
			<div className="flex items-center justify-between">
				<div>
					<p className="text-sm text-muted-foreground">
						Scripts for <span className="font-medium">{projectName}</span>
					</p>
				</div>
				<div className="flex gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={handleLearnMore}
						className="gap-1.5"
					>
						Learn more
						<HiArrowTopRightOnSquare className="h-3.5 w-3.5" />
					</Button>
					{hasChanges && (
						<Button
							size="sm"
							onClick={handleSave}
							disabled={updateConfigMutation.isPending}
						>
							{updateConfigMutation.isPending ? "Saving..." : "Save Changes"}
						</Button>
					)}
				</div>
			</div>

			<ScriptsSection
				title="Setup Scripts"
				description="Run when a new workspace is created from this project"
				scripts={setupScripts}
				onChange={handleSetupChange}
				onAdd={handleAddSetup}
				onRemove={handleRemoveSetup}
				onFileDrop={handleFileDropSetup}
				onImportFile={handleImportSetupFile}
			/>

			<div className="border-t" />

			<ScriptsSection
				title="Teardown Scripts"
				description="Run when a workspace is deleted"
				scripts={teardownScripts}
				onChange={handleTeardownChange}
				onAdd={handleAddTeardown}
				onRemove={handleRemoveTeardown}
				onFileDrop={handleFileDropTeardown}
				onImportFile={handleImportTeardownFile}
			/>
		</div>
	);
}

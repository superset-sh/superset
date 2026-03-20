import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { HiArrowTopRightOnSquare, HiDocumentArrowUp } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { invalidateProjectScriptQueries } from "renderer/lib/project-scripts";
import { EXTERNAL_LINKS } from "shared/constants";

interface ScriptsEditorProps {
	projectId: string;
	className?: string;
}

function parseContentFromConfig(content: string | null): {
	setup: string;
	teardown: string;
	run: string;
} {
	if (!content) {
		return { setup: "", teardown: "", run: "" };
	}

	try {
		const parsed = JSON.parse(content);
		return {
			setup: (parsed.setup ?? []).join("\n"),
			teardown: (parsed.teardown ?? []).join("\n"),
			run: (parsed.run ?? []).join("\n"),
		};
	} catch {
		return { setup: "", teardown: "", run: "" };
	}
}

interface ScriptTextareaProps {
	title: string;
	description: string;
	placeholder: string;
	value: string;
	onChange: (value: string) => void;
	onBlur?: () => void;
}

function ScriptTextarea({
	title,
	description,
	placeholder,
	value,
	onChange,
	onBlur,
}: ScriptTextareaProps) {
	const [isDragOver, setIsDragOver] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const importFirstFile = useCallback(
		async (files: File[]) => {
			const scriptFile = files.find((file) =>
				file.name.match(/\.(sh|bash|zsh|command)$/i),
			);
			if (!scriptFile) {
				return;
			}

			try {
				const content = await scriptFile.text();
				onChange(content);
			} catch (error) {
				console.error("[scripts/import] Failed to read file:", error);
			}
		},
		[onChange],
	);

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

			await importFirstFile(Array.from(e.dataTransfer.files));
		},
		[importFirstFile],
	);

	const handleFileInputChange = useCallback(
		async (event: React.ChangeEvent<HTMLInputElement>) => {
			const files = event.target.files ? Array.from(event.target.files) : [];
			await importFirstFile(files);
			// Reset value so re-selecting the same file triggers onChange again.
			event.target.value = "";
		},
		[importFirstFile],
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
					onBlur={onBlur}
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
				onClick={() => fileInputRef.current?.click()}
				className="gap-1.5 text-muted-foreground"
			>
				<HiDocumentArrowUp className="h-3.5 w-3.5" />
				Import file
			</Button>
			<input
				ref={fileInputRef}
				type="file"
				accept=".sh,.bash,.zsh,.command"
				onChange={handleFileInputChange}
				className="hidden"
			/>
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
	const [runContent, setRunContent] = useState("");
	const [hasChanges, setHasChanges] = useState(false);
	const latestContentRef = useRef({
		setup: "",
		teardown: "",
		run: "",
	});
	const lastSavedPayloadRef = useRef('{"setup":[],"teardown":[],"run":[]}');
	const saveInFlightRef = useRef(false);
	const saveQueuedRef = useRef(false);

	latestContentRef.current = {
		setup: setupContent,
		teardown: teardownContent,
		run: runContent,
	};

	const buildPayload = useCallback(
		(content: { setup: string; teardown: string; run: string }) => ({
			projectId,
			setup: content.setup.trim() ? [content.setup.trim()] : [],
			teardown: content.teardown.trim() ? [content.teardown.trim()] : [],
			run: content.run.trim() ? [content.run.trim()] : [],
		}),
		[projectId],
	);

	const serializePayload = useCallback(
		(payload: { setup: string[]; teardown: string[]; run: string[] }) =>
			JSON.stringify(payload),
		[],
	);

	useEffect(() => {
		const parsed = parseContentFromConfig(configData?.content ?? null);
		setSetupContent(parsed.setup);
		setTeardownContent(parsed.teardown);
		setRunContent(parsed.run);
		setHasChanges(false);
		lastSavedPayloadRef.current = serializePayload(
			buildPayload({
				setup: parsed.setup,
				teardown: parsed.teardown,
				run: parsed.run,
			}),
		);
	}, [buildPayload, configData?.content, serializePayload]);

	const updateConfigMutation = electronTrpc.config.updateConfig.useMutation();

	const handleSetupChange = useCallback((value: string) => {
		setSetupContent(value);
		setHasChanges(true);
	}, []);

	const handleTeardownChange = useCallback((value: string) => {
		setTeardownContent(value);
		setHasChanges(true);
	}, []);

	const handleRunChange = useCallback((value: string) => {
		setRunContent(value);
		setHasChanges(true);
	}, []);

	const handleSave = useCallback(async () => {
		if (saveInFlightRef.current) {
			saveQueuedRef.current = true;
			return;
		}

		saveInFlightRef.current = true;
		try {
			do {
				saveQueuedRef.current = false;
				const payload = buildPayload(latestContentRef.current);
				const serializedPayload = serializePayload(payload);

				if (serializedPayload === lastSavedPayloadRef.current) {
					setHasChanges(false);
					continue;
				}

				await updateConfigMutation.mutateAsync(payload);
				lastSavedPayloadRef.current = serializedPayload;
				await invalidateProjectScriptQueries(utils, projectId);

				const currentPayload = buildPayload(latestContentRef.current);
				setHasChanges(
					serializePayload(currentPayload) !== lastSavedPayloadRef.current,
				);
			} while (saveQueuedRef.current);
		} finally {
			saveInFlightRef.current = false;
		}
	}, [buildPayload, updateConfigMutation, projectId, serializePayload, utils]);

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
				onBlur={() => void handleSave()}
			/>

			<ScriptTextarea
				title="Teardown"
				description="Runs when a workspace is deleted."
				placeholder="e.g. docker compose down"
				value={teardownContent}
				onChange={handleTeardownChange}
				onBlur={() => void handleSave()}
			/>

			<ScriptTextarea
				title="Run"
				description="A command to start your dev server, triggered via keyboard shortcut."
				placeholder="e.g. bun run dev"
				value={runContent}
				onChange={handleRunChange}
				onBlur={() => void handleSave()}
			/>
		</div>
	);
}

import { Button } from "@superset/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { Textarea } from "@superset/ui/textarea";
import { cn } from "@superset/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	HiArrowTopRightOnSquare,
	HiCheckCircle,
	HiDocumentArrowUp,
} from "react-icons/hi2";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { EXTERNAL_LINKS } from "shared/constants";

interface V2ScriptsEditorProps {
	hostUrl: string;
	projectId: string;
	className?: string;
}

interface ParsedConfig {
	setup: string;
	teardown: string;
}

function parseConfigContent(content: string | null): ParsedConfig {
	if (!content) return { setup: "", teardown: "" };
	try {
		const parsed = JSON.parse(content);
		const setup = Array.isArray(parsed?.setup)
			? parsed.setup.filter((s: unknown): s is string => typeof s === "string")
			: [];
		const teardown = Array.isArray(parsed?.teardown)
			? parsed.teardown.filter(
					(s: unknown): s is string => typeof s === "string",
				)
			: [];
		return {
			setup: setup.join("\n"),
			teardown: teardown.join("\n"),
		};
	} catch {
		return { setup: "", teardown: "" };
	}
}

function toCommandsArray(value: string): string[] {
	return value
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

function arraysEqual(a: string[], b: string[]): boolean {
	return a.length === b.length && a.every((v, i) => v === b[i]);
}

type SaveStatus = "idle" | "saving" | "saved";

export function V2ScriptsEditor({
	hostUrl,
	projectId,
	className,
}: V2ScriptsEditorProps) {
	const queryClient = useQueryClient();

	const configQueryKey = [
		"host-config",
		"getConfigContent",
		hostUrl,
		projectId,
	];

	const { data: configData, isLoading } = useQuery({
		queryKey: configQueryKey,
		queryFn: () =>
			getHostServiceClientByUrl(hostUrl).config.getConfigContent.query({
				projectId,
			}),
	});

	const [setupValue, setSetupValue] = useState("");
	const [teardownValue, setTeardownValue] = useState("");
	const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
	const focusedRef = useRef<"setup" | "teardown" | null>(null);
	const lastSavedRef = useRef<{ setup: string[]; teardown: string[] }>({
		setup: [],
		teardown: [],
	});
	const savedTimerRef = useRef<NodeJS.Timeout | null>(null);

	useEffect(() => {
		// Don't clobber an in-progress edit when the server-side query refetches.
		if (focusedRef.current) return;
		const parsed = parseConfigContent(configData?.content ?? null);
		setSetupValue(parsed.setup);
		setTeardownValue(parsed.teardown);
		lastSavedRef.current = {
			setup: toCommandsArray(parsed.setup),
			teardown: toCommandsArray(parsed.teardown),
		};
	}, [configData?.content]);

	useEffect(() => {
		return () => {
			if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
		};
	}, []);

	const updateMutation = useMutation({
		mutationFn: (input: {
			projectId: string;
			setup: string[];
			teardown: string[];
		}) => getHostServiceClientByUrl(hostUrl).config.updateConfig.mutate(input),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: configQueryKey });
		},
	});

	const flushSave = useCallback(
		async (next: { setup: string[]; teardown: string[] }) => {
			if (
				arraysEqual(next.setup, lastSavedRef.current.setup) &&
				arraysEqual(next.teardown, lastSavedRef.current.teardown)
			) {
				return;
			}

			if (savedTimerRef.current) {
				clearTimeout(savedTimerRef.current);
				savedTimerRef.current = null;
			}

			setSaveStatus("saving");
			try {
				await updateMutation.mutateAsync({ projectId, ...next });
				lastSavedRef.current = next;
				setSaveStatus("saved");
				savedTimerRef.current = setTimeout(() => {
					setSaveStatus("idle");
					savedTimerRef.current = null;
				}, 2000);
			} catch (error) {
				console.error("[v2-scripts/save] failed", error);
				setSaveStatus("idle");
			}
		},
		[projectId, updateMutation],
	);

	const handleBlur = useCallback(
		async (field: "setup" | "teardown") => {
			focusedRef.current = null;

			const trimmedSetup = setupValue
				.split("\n")
				.map((line) => line.trim())
				.join("\n")
				.replace(/^\n+|\n+$/g, "");
			const trimmedTeardown = teardownValue
				.split("\n")
				.map((line) => line.trim())
				.join("\n")
				.replace(/^\n+|\n+$/g, "");

			if (trimmedSetup !== setupValue) setSetupValue(trimmedSetup);
			if (trimmedTeardown !== teardownValue) setTeardownValue(trimmedTeardown);

			await flushSave({
				setup: toCommandsArray(field === "setup" ? trimmedSetup : setupValue),
				teardown: toCommandsArray(
					field === "teardown" ? trimmedTeardown : teardownValue,
				),
			});
		},
		[flushSave, setupValue, teardownValue],
	);

	if (isLoading) {
		return (
			<div className={cn("space-y-3", className)}>
				<div className="h-24 bg-muted/30 rounded-lg animate-pulse" />
			</div>
		);
	}

	return (
		<div className={cn("space-y-3", className)}>
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					{saveStatus === "saving" && (
						<span className="flex items-center gap-1">
							<span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
							Saving…
						</span>
					)}
					{saveStatus === "saved" && (
						<span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
							<HiCheckCircle className="h-3.5 w-3.5" />
							Saved
						</span>
					)}
				</div>
				<Button variant="ghost" size="sm" className="h-7" asChild>
					<a
						href={EXTERNAL_LINKS.SETUP_TEARDOWN_SCRIPTS}
						target="_blank"
						rel="noopener noreferrer"
					>
						Docs
						<HiArrowTopRightOnSquare className="h-3.5 w-3.5" />
					</a>
				</Button>
			</div>

			<Tabs defaultValue="setup">
				<TabsList>
					<TabsTrigger value="setup">Setup</TabsTrigger>
					<TabsTrigger value="teardown">Teardown</TabsTrigger>
				</TabsList>
				<TabsContent value="setup">
					<ScriptField
						field="setup"
						description="Runs when a new workspace is created. Multiple lines run as one chain — failures short-circuit."
						placeholder="bun install&#10;bun run db:migrate"
						value={setupValue}
						onChange={setSetupValue}
						onFocus={() => {
							focusedRef.current = "setup";
						}}
						onBlur={() => handleBlur("setup")}
					/>
				</TabsContent>
				<TabsContent value="teardown">
					<ScriptField
						field="teardown"
						description="Runs when a workspace is deleted."
						placeholder="docker compose down"
						value={teardownValue}
						onChange={setTeardownValue}
						onFocus={() => {
							focusedRef.current = "teardown";
						}}
						onBlur={() => handleBlur("teardown")}
					/>
				</TabsContent>
			</Tabs>
		</div>
	);
}

interface ScriptFieldProps {
	field: "setup" | "teardown";
	description: string;
	placeholder: string;
	value: string;
	onChange: (value: string) => void;
	onFocus: () => void;
	onBlur: () => void;
}

function ScriptField({
	description,
	placeholder,
	value,
	onChange,
	onFocus,
	onBlur,
}: ScriptFieldProps) {
	const [isDragOver, setIsDragOver] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const importFirstFile = useCallback(
		async (files: File[]) => {
			const scriptFile = files.find((file) =>
				file.name.match(/\.(sh|bash|zsh|command)$/i),
			);
			if (!scriptFile) return;
			try {
				onChange(await scriptFile.text());
			} catch (error) {
				console.error("[v2-scripts/import] failed to read file", error);
			}
		},
		[onChange],
	);

	return (
		<div className="space-y-2">
			<p className="text-xs text-muted-foreground">{description}</p>

			{/* biome-ignore lint/a11y/useSemanticElements: drop zone wrapper */}
			<div
				role="region"
				aria-label="Script editor with file drop support"
				className={cn(
					"relative rounded-md border transition-colors",
					isDragOver
						? "ring-2 ring-primary/40 border-primary/60"
						: "border-input",
				)}
				onDragOver={(e) => {
					e.preventDefault();
					e.stopPropagation();
					setIsDragOver(true);
				}}
				onDragLeave={(e) => {
					e.preventDefault();
					e.stopPropagation();
					setIsDragOver(false);
				}}
				onDrop={async (e) => {
					e.preventDefault();
					e.stopPropagation();
					setIsDragOver(false);
					await importFirstFile(Array.from(e.dataTransfer.files));
				}}
			>
				<Textarea
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onFocus={onFocus}
					onBlur={onBlur}
					placeholder={placeholder}
					rows={4}
					className="font-mono text-sm border-0 shadow-none focus-visible:ring-0 focus-visible:border-0 resize-y"
				/>
				{isDragOver && (
					<div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-primary/10">
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
				className="h-7 gap-1.5 text-muted-foreground"
				onClick={() => fileInputRef.current?.click()}
			>
				<HiDocumentArrowUp className="h-3.5 w-3.5" />
				Import file
			</Button>
			<input
				ref={fileInputRef}
				type="file"
				accept=".sh,.bash,.zsh,.command"
				className="hidden"
				onChange={async (e) => {
					const files = e.target.files ? Array.from(e.target.files) : [];
					await importFirstFile(files);
					e.target.value = "";
				}}
			/>
		</div>
	);
}

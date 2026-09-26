import { Trans } from "@lingui/react/macro";
import { Skeleton } from "@superset/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { cn } from "@superset/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { HiCheckCircle } from "react-icons/hi2";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { ScriptField } from "./components/ScriptField";
import {
	buildPayload,
	parseConfigContent,
	payloadsEqual,
	type ScriptFieldName,
	type ScriptPayload,
	type ScriptTexts,
	toScriptTexts,
	trimScriptValue,
} from "./utils/scriptPayload";

interface V2ScriptsEditorProps {
	hostUrl: string;
	projectId: string;
	className?: string;
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
	const [runValue, setRunValue] = useState("");
	const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
	const focusedRef = useRef<ScriptFieldName | null>(null);
	const latestValuesRef = useRef<ScriptTexts>({
		setup: "",
		teardown: "",
		run: "",
	});
	const loadedRef = useRef<ScriptPayload>({
		setup: [],
		teardown: [],
		run: [],
	});
	const lastSavedRef = useRef<ScriptPayload>(loadedRef.current);
	const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const saveInFlightRef = useRef(false);
	const queuedPayloadRef = useRef<ScriptPayload | null>(null);

	useEffect(() => {
		// Don't clobber an in-progress edit when the server-side query refetches.
		if (
			focusedRef.current ||
			debounceTimerRef.current ||
			saveInFlightRef.current ||
			queuedPayloadRef.current
		) {
			return;
		}
		const loaded = parseConfigContent(configData?.content ?? null);
		const texts = toScriptTexts(loaded);
		setSetupValue(texts.setup);
		setTeardownValue(texts.teardown);
		setRunValue(texts.run);
		latestValuesRef.current = texts;
		loadedRef.current = loaded;
		lastSavedRef.current = loaded;
	}, [configData?.content]);

	useEffect(() => {
		return () => {
			if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
			if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
		};
	}, []);

	const updateMutation = useMutation({
		mutationFn: (input: {
			projectId: string;
			setup: string[];
			teardown: string[];
			run: string[];
		}) => getHostServiceClientByUrl(hostUrl).config.updateConfig.mutate(input),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: configQueryKey });
		},
	});

	const flushSave = useCallback(
		async (
			next: ScriptPayload = buildPayload(
				latestValuesRef.current,
				loadedRef.current,
			),
		) => {
			if (payloadsEqual(next, lastSavedRef.current)) {
				return;
			}

			if (saveInFlightRef.current) {
				queuedPayloadRef.current = next;
				return;
			}

			if (savedTimerRef.current) {
				clearTimeout(savedTimerRef.current);
				savedTimerRef.current = null;
			}

			setSaveStatus("saving");
			saveInFlightRef.current = true;
			try {
				let payloadToSave: ScriptPayload | null = next;

				while (payloadToSave) {
					queuedPayloadRef.current = null;

					if (!payloadsEqual(payloadToSave, lastSavedRef.current)) {
						await updateMutation.mutateAsync({ projectId, ...payloadToSave });
						lastSavedRef.current = payloadToSave;
					}

					payloadToSave = queuedPayloadRef.current;
				}

				setSaveStatus("saved");
				savedTimerRef.current = setTimeout(() => {
					setSaveStatus("idle");
					savedTimerRef.current = null;
				}, 2000);
			} catch (error) {
				console.error("[v2-scripts/save] failed", error);
				queuedPayloadRef.current =
					queuedPayloadRef.current ??
					buildPayload(latestValuesRef.current, loadedRef.current);
				setSaveStatus("idle");
				if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
				debounceTimerRef.current = setTimeout(() => {
					debounceTimerRef.current = null;
					const payloadToRetry = queuedPayloadRef.current;
					queuedPayloadRef.current = null;
					if (payloadToRetry) void flushSave(payloadToRetry);
				}, 1000);
			} finally {
				saveInFlightRef.current = false;
			}
		},
		[projectId, updateMutation],
	);

	const scheduleSave = useCallback(
		(nextValues: ScriptTexts) => {
			latestValuesRef.current = nextValues;

			if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

			debounceTimerRef.current = setTimeout(() => {
				debounceTimerRef.current = null;
				void flushSave(
					buildPayload(latestValuesRef.current, loadedRef.current),
				);
			}, 500);
		},
		[flushSave],
	);

	const handleChange = useCallback(
		(field: ScriptFieldName, value: string) => {
			const nextValues = { ...latestValuesRef.current, [field]: value };
			latestValuesRef.current = nextValues;

			if (field === "setup") setSetupValue(value);
			if (field === "teardown") setTeardownValue(value);
			if (field === "run") setRunValue(value);

			scheduleSave(nextValues);
		},
		[scheduleSave],
	);

	const handleBlur = useCallback(async () => {
		focusedRef.current = null;

		if (debounceTimerRef.current) {
			clearTimeout(debounceTimerRef.current);
			debounceTimerRef.current = null;
		}

		const trimmedValues = {
			setup: trimScriptValue(latestValuesRef.current.setup),
			teardown: trimScriptValue(latestValuesRef.current.teardown),
			run: trimScriptValue(latestValuesRef.current.run),
		};
		latestValuesRef.current = trimmedValues;

		if (trimmedValues.setup !== setupValue) setSetupValue(trimmedValues.setup);
		if (trimmedValues.teardown !== teardownValue) {
			setTeardownValue(trimmedValues.teardown);
		}
		if (trimmedValues.run !== runValue) setRunValue(trimmedValues.run);

		await flushSave(buildPayload(trimmedValues, loadedRef.current));
	}, [flushSave, runValue, setupValue, teardownValue]);

	if (isLoading) {
		return (
			<div className={cn("space-y-3", className)} aria-busy="true">
				<div className="flex h-9 items-center gap-5 border-b border-border px-2">
					<Skeleton className="h-3 w-10" />
					<Skeleton className="h-3 w-14" />
					<Skeleton className="h-3 w-8" />
				</div>
				<Skeleton className="h-24 w-full rounded-md" />
			</div>
		);
	}

	return (
		<div className={cn("space-y-3", className)}>
			<Tabs defaultValue="setup">
				<div className="flex items-center justify-between gap-2 border-b border-border">
					<TabsList className="h-auto gap-0 rounded-none bg-transparent p-0">
						<TabsTrigger
							value="setup"
							className="relative h-8 rounded-none border-0 bg-transparent px-3 text-sm font-medium text-muted-foreground shadow-none transition-colors hover:text-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-transparent data-[state=active]:after:bg-foreground"
						>
							<Trans>Setup</Trans>
						</TabsTrigger>
						<TabsTrigger
							value="teardown"
							className="relative h-8 rounded-none border-0 bg-transparent px-3 text-sm font-medium text-muted-foreground shadow-none transition-colors hover:text-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-transparent data-[state=active]:after:bg-foreground"
						>
							<Trans>Teardown</Trans>
						</TabsTrigger>
						<TabsTrigger
							value="run"
							className="relative h-8 rounded-none border-0 bg-transparent px-3 text-sm font-medium text-muted-foreground shadow-none transition-colors hover:text-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-transparent data-[state=active]:after:bg-foreground"
						>
							<Trans>Run</Trans>
						</TabsTrigger>
					</TabsList>
					<div className="flex h-5 items-center pb-1.5 text-xs text-muted-foreground">
						{saveStatus === "saving" && (
							<span>
								<Trans>Saving…</Trans>
							</span>
						)}
						{saveStatus === "saved" && (
							<span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
								<HiCheckCircle className="h-3.5 w-3.5" />
								<Trans>Saved</Trans>
							</span>
						)}
					</div>
				</div>
				<TabsContent value="setup">
					<ScriptField
						placeholder="bun install&#10;bun run db:migrate"
						value={setupValue}
						onChange={(value) => handleChange("setup", value)}
						onFocus={() => {
							focusedRef.current = "setup";
						}}
						onBlur={() => handleBlur()}
					/>
				</TabsContent>
				<TabsContent value="teardown">
					<ScriptField
						placeholder="docker compose down"
						value={teardownValue}
						onChange={(value) => handleChange("teardown", value)}
						onFocus={() => {
							focusedRef.current = "teardown";
						}}
						onBlur={() => handleBlur()}
					/>
				</TabsContent>
				<TabsContent value="run">
					<ScriptField
						placeholder="bun dev"
						value={runValue}
						onChange={(value) => handleChange("run", value)}
						onFocus={() => {
							focusedRef.current = "run";
						}}
						onBlur={() => handleBlur()}
					/>
				</TabsContent>
			</Tabs>
		</div>
	);
}

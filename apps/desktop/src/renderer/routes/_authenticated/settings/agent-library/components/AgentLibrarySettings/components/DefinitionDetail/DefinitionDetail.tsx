import {
	AGENT_EFFORT_LEVELS,
	type DefinitionDetail as DefinitionDetailData,
	type DefinitionSummary,
} from "@superset/shared/agent-library";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { useMutation } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAgentLibraryDefinition } from "renderer/hooks/useAgentLibrary";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { getHostServiceUnavailableMessage } from "renderer/lib/host-service-unavailable";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { CodeEditor } from "renderer/screens/main/components/WorkspaceView/components/CodeEditor";
import { getTrpcErrorCode } from "../../utils/getTrpcErrorCode";
import type { ScopeInfo } from "../AgentLibrarySidebar";
import { ModelSelect } from "../ModelSelect";
import { AiChatPanel } from "./components/AiChatPanel";
import { DeleteDefinitionSection } from "./components/DeleteDefinitionSection";
import { TransferMenu } from "./components/TransferMenu";

const KNOWN_FORM_KEYS = new Set(["name", "description", "model", "effort"]);
const EFFORT_DEFAULT = "__default__";

const SAVED_TOAST =
	"Saved. Running Claude Code sessions pick this up on the next agent spawn / skill use.";

interface DefinitionDetailProps {
	summary: DefinitionSummary;
	scopes: ScopeInfo[];
	onMutated: () => void;
	onDeleted: () => void;
}

export function DefinitionDetail({
	summary,
	scopes,
	onMutated,
	onDeleted,
}: DefinitionDetailProps) {
	const hostService = useLocalHostService();
	const { activeHostUrl } = hostService;
	const detailQuery = useAgentLibraryDefinition({
		hostUrl: activeHostUrl,
		scopeKey: summary.scopeKey,
		kind: summary.kind,
		name: summary.name,
	});
	const detail = detailQuery.data ?? null;

	const [mode, setMode] = useState<"form" | "raw">("form");
	const [model, setModel] = useState<string | null>(null);
	const [effort, setEffort] = useState<string | null>(null);
	const [description, setDescription] = useState("");
	const [body, setBody] = useState("");
	const [raw, setRaw] = useState("");
	const [hasConflict, setHasConflict] = useState(false);
	const [baseline, setBaseline] = useState<DefinitionDetailData | null>(null);
	const [isChatOpen, setIsChatOpen] = useState(false);

	const isDirty =
		baseline !== null &&
		(mode === "raw"
			? raw !== baseline.raw
			: model !== baseline.model ||
				effort !== baseline.effort ||
				description !== baseline.description ||
				body !== baseline.body);
	const isDirtyRef = useRef(isDirty);
	isDirtyRef.current = isDirty;

	// Initialize/reset the draft whenever a fresh detail arrives. `baseline`
	// is the exact detail snapshot the draft was derived from — dirty checks,
	// patch diffs, and `expectedRevision` all use it, so a background refetch
	// can never silently rebase the draft onto newer file content. If the file
	// changed underneath an unsaved draft (external edit or the AI agent),
	// keep the draft and surface the conflict banner instead of clobbering.
	useEffect(() => {
		if (!detail) return;
		if (baseline?.revision === detail.revision) return;
		if (baseline !== null && isDirtyRef.current) {
			setHasConflict(true);
			return;
		}
		setModel(detail.model);
		setEffort(detail.effort);
		setDescription(detail.description);
		setBody(detail.body);
		setRaw(detail.raw);
		setHasConflict(false);
		setBaseline(detail);
	}, [detail, baseline]);

	const saveMutation = useMutation({
		mutationFn: async () => {
			if (!activeHostUrl || !baseline) {
				throw new Error(
					getHostServiceUnavailableMessage(hostService, {
						action: "save the definition",
					}),
				);
			}
			const client = getHostServiceClientByUrl(activeHostUrl);
			if (mode === "raw") {
				return client.agentLibrary.save.mutate({
					scopeKey: summary.scopeKey,
					kind: summary.kind,
					name: summary.name,
					raw,
					expectedRevision: baseline.revision,
				});
			}
			const patch: {
				model?: string | null;
				effort?: string | null;
				description?: string | null;
			} = {};
			if (model !== baseline.model) patch.model = model;
			if (effort !== baseline.effort) patch.effort = effort;
			if (description !== baseline.description) {
				patch.description = description === "" ? null : description;
			}
			return client.agentLibrary.save.mutate({
				scopeKey: summary.scopeKey,
				kind: summary.kind,
				name: summary.name,
				patch: Object.keys(patch).length > 0 ? patch : undefined,
				body: body !== baseline.body ? body : undefined,
				expectedRevision: baseline.revision,
			});
		},
		onSuccess: () => {
			toast.success(SAVED_TOAST);
			setBaseline(null); // force draft re-init from the refetched detail
			void detailQuery.refetch();
			onMutated();
		},
		onError: (err) => {
			if (getTrpcErrorCode(err) === "PRECONDITION_FAILED") {
				setHasConflict(true);
				return;
			}
			toast.error(err instanceof Error ? err.message : "Failed to save");
		},
	});

	const isModelInvalid =
		mode === "form" && model !== null && model.trim() === "";
	const canSave =
		isDirty && !hasConflict && !isModelInvalid && !saveMutation.isPending;

	const scope = scopes.find((s) => s.scopeKey === summary.scopeKey) ?? null;
	const scopeLabel =
		scope?.kind === "user" ? "User (~/.claude)" : (scope?.label ?? "Project");
	const extraKeys = detail
		? Object.keys(detail.frontmatter).filter((key) => !KNOWN_FORM_KEYS.has(key))
		: [];

	if (detailQuery.isError) {
		return (
			<div className="p-6 text-sm text-destructive select-text cursor-text">
				Couldn't load {summary.kind} "{summary.name}":{" "}
				{detailQuery.error instanceof Error
					? detailQuery.error.message
					: "unknown error"}
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0">
			<div className="flex-1 overflow-y-auto">
				<div className="p-6 max-w-3xl space-y-8">
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0">
							<div className="flex items-center gap-2">
								<h2 className="text-xl font-semibold truncate">
									{summary.name}
								</h2>
								<Badge variant="outline" className="shrink-0">
									{summary.kind}
								</Badge>
							</div>
							<p
								className="text-sm text-muted-foreground mt-0.5 truncate"
								title={`${scope?.rootPath ?? ""}/${summary.relativePath}`}
							>
								{scopeLabel} · {summary.relativePath}
							</p>
						</div>
						<div className="flex items-center gap-2 shrink-0">
							<TransferMenu
								summary={summary}
								scopes={scopes}
								onDone={onMutated}
							/>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setMode(mode === "form" ? "raw" : "form")}
							>
								{mode === "form" ? "Edit raw" : "Form view"}
							</Button>
							<Button
								variant={isChatOpen ? "secondary" : "ghost"}
								size="sm"
								onClick={() => setIsChatOpen((open) => !open)}
							>
								<Sparkles className="size-3.5 mr-1" />
								AI edit
							</Button>
						</div>
					</div>

					{hasConflict && (
						<div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm space-y-2">
							<p className="select-text cursor-text">
								This file changed on disk since it was loaded. Reload to pick up
								the new content (your unsaved edits here will be discarded), or
								keep editing and resolve manually via "Edit raw".
							</p>
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									setBaseline(null);
									setHasConflict(false);
									void detailQuery.refetch();
								}}
							>
								Reload file
							</Button>
						</div>
					)}

					{mode === "form" ? (
						<>
							{summary.kind === "agent" && (
								<section className="space-y-4">
									<h3 className="text-sm font-medium">Defaults</h3>
									<div className="space-y-1.5">
										<p className="text-xs text-muted-foreground">Model</p>
										<ModelSelect
											value={model}
											onChange={setModel}
											disabled={!baseline}
										/>
									</div>
									<div className="space-y-1.5">
										<p className="text-xs text-muted-foreground">
											Reasoning effort
										</p>
										<Select
											disabled={!baseline}
											value={effort ?? EFFORT_DEFAULT}
											onValueChange={(next) =>
												setEffort(next === EFFORT_DEFAULT ? null : next)
											}
										>
											<SelectTrigger className="w-44">
												<SelectValue placeholder="Default (inherit)" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value={EFFORT_DEFAULT}>
													Default (inherit)
												</SelectItem>
												{AGENT_EFFORT_LEVELS.map((level) => (
													<SelectItem key={level} value={level}>
														{level}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								</section>
							)}

							<section className="space-y-1.5">
								<h3 className="text-sm font-medium">Description</h3>
								<p className="text-xs text-muted-foreground">
									{summary.kind === "agent"
										? "Tells the main agent when to delegate to this subagent."
										: "Tells the model when to invoke this skill."}
								</p>
								<Textarea
									value={description}
									disabled={!baseline}
									onChange={(event) => setDescription(event.target.value)}
									rows={3}
								/>
							</section>

							{extraKeys.length > 0 && (
								<section className="space-y-1.5">
									<h3 className="text-sm font-medium">Other frontmatter</h3>
									<div className="flex flex-wrap gap-1.5">
										{extraKeys.map((key) => (
											<Badge
												key={key}
												variant="secondary"
												className="font-mono"
											>
												{key}
											</Badge>
										))}
									</div>
									<p className="text-xs text-muted-foreground">
										Preserved on save — switch to "Edit raw" to change these.
									</p>
								</section>
							)}

							<section className="space-y-1.5">
								<h3 className="text-sm font-medium">Instructions</h3>
								<div className="rounded-md border overflow-hidden min-h-64">
									<CodeEditor
										value={body}
										language="markdown"
										fillHeight={false}
										onChange={setBody}
										onSave={() => {
											if (canSave) saveMutation.mutate();
										}}
									/>
								</div>
							</section>
						</>
					) : (
						<section className="space-y-1.5">
							<h3 className="text-sm font-medium">Raw file</h3>
							<div className="rounded-md border overflow-hidden min-h-80">
								<CodeEditor
									value={raw}
									language="markdown"
									fillHeight={false}
									onChange={setRaw}
									onSave={() => {
										if (canSave) saveMutation.mutate();
									}}
								/>
							</div>
						</section>
					)}

					<div className="flex items-center gap-3">
						<Button disabled={!canSave} onClick={() => saveMutation.mutate()}>
							{saveMutation.isPending ? "Saving…" : "Save"}
						</Button>
						{isModelInvalid && (
							<p className="text-xs text-destructive">
								Enter a custom model id (or pick one) before saving.
							</p>
						)}
						{isDirty && !isModelInvalid && (
							<p className="text-xs text-muted-foreground">Unsaved changes</p>
						)}
					</div>

					<DeleteDefinitionSection summary={summary} onDeleted={onDeleted} />
				</div>
			</div>

			{isChatOpen && scope && (
				<div className="w-96 shrink-0 border-l flex flex-col min-h-0">
					<div className="border-b px-3 py-2 flex items-center justify-between">
						<p className="text-sm font-medium">AI edit</p>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setIsChatOpen(false)}
						>
							Close
						</Button>
					</div>
					<AiChatPanel
						summary={summary}
						scopeRootPath={scope.rootPath}
						onAgentTurnEnd={() => {
							void detailQuery.refetch();
							onMutated();
						}}
					/>
				</div>
			)}
		</div>
	);
}

import { Button } from "@superset/ui/button";
import { Checkbox } from "@superset/ui/checkbox";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { GoGitBranch } from "react-icons/go";
import {
	HiCheck,
	HiChevronDown,
	HiChevronLeft,
	HiChevronRight,
	HiChevronUpDown,
} from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
import { electronTrpcClient as trpcClient } from "renderer/lib/trpc-client";
import { resolveEffectiveWorkspaceBaseBranch } from "renderer/lib/workspaceBaseBranch";
import { useCreateWorkspace } from "renderer/react-query/workspaces";
import { NotFound } from "renderer/routes/not-found";
import type { SetupAction } from "shared/types/config";
import { sanitizeSegment } from "shared/utils/branch";
import { ExternalWorktreesBanner } from "./components/ExternalWorktreesBanner";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/project/$projectId/",
)({
	component: ProjectPage,
	notFoundComponent: NotFound,
	loader: async ({ params, context }) => {
		const queryKey = [
			["projects", "get"],
			{ input: { id: params.projectId }, type: "query" },
		];

		try {
			await context.queryClient.ensureQueryData({
				queryKey,
				queryFn: () => trpcClient.projects.get.query({ id: params.projectId }),
			});
		} catch (error) {
			if (error instanceof Error && error.message.includes("not found")) {
				throw notFound();
			}
			throw error;
		}
	},
});

type Step = "workspace" | "setup";

function generateBranchFromTitle({
	title,
	authorPrefix,
}: {
	title: string;
	authorPrefix?: string;
}): string {
	const slug = sanitizeSegment(title);
	if (!slug) return "";

	if (authorPrefix) {
		return `${authorPrefix}/${slug}`;
	}
	return slug;
}

function splitCommands(value: string): string[] {
	return value
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

function parseConfigContent(content: string | null): {
	setup: string[];
	teardown: string[];
} {
	if (!content) {
		return { setup: [], teardown: [] };
	}

	try {
		const parsed = JSON.parse(content);
		return {
			setup: Array.isArray(parsed.setup)
				? parsed.setup.filter((c: unknown) => typeof c === "string")
				: [],
			teardown: Array.isArray(parsed.teardown)
				? parsed.teardown.filter((c: unknown) => typeof c === "string")
				: [],
		};
	} catch {
		return { setup: [], teardown: [] };
	}
}

function ProjectPage() {
	const { projectId } = Route.useParams();

	const { data: project } = electronTrpc.projects.get.useQuery({
		id: projectId,
	});
	const {
		data: branchData,
		isLoading: isBranchesLoading,
		isError: isBranchesError,
	} = electronTrpc.projects.getBranches.useQuery(
		{ projectId },
		{ enabled: !!projectId },
	);
	const { data: gitAuthor } = electronTrpc.projects.getGitAuthor.useQuery(
		{ id: projectId },
		{ enabled: !!projectId },
	);
	const { data: configData } = electronTrpc.config.getConfigContent.useQuery(
		{ projectId },
		{ enabled: !!projectId },
	);
	const { data: setupDefaults } =
		electronTrpc.config.getSetupOnboardingDefaults.useQuery(
			{ projectId },
			{ enabled: !!projectId },
		);

	const utils = electronTrpc.useUtils();
	const updateConfigMutation = electronTrpc.config.updateConfig.useMutation({
		onSuccess: async () => {
			await utils.config.getConfigContent.invalidate({ projectId });
			await utils.config.shouldShowSetupCard.invalidate({ projectId });
		},
	});

	const [step, setStep] = useState<Step>("workspace");
	const [title, setTitle] = useState("");
	const [baseBranch, setBaseBranch] = useState<string | null>(null);
	const [baseBranchOpen, setBaseBranchOpen] = useState(false);
	const [branchSearch, setBranchSearch] = useState("");
	const [showAdvanced, setShowAdvanced] = useState(false);
	const [teardownOpen, setTeardownOpen] = useState(false);
	const [setupMode, setSetupMode] = useState<"checklist" | "custom">(
		"checklist",
	);
	const [actions, setActions] = useState<SetupAction[]>([]);
	const [setupContent, setSetupContent] = useState("");
	const [teardownContent, setTeardownContent] = useState("");

	const titleInputRef = useRef<HTMLInputElement>(null);
	const [hasInitializedSetup, setHasInitializedSetup] = useState(false);

	const createWorkspace = useCreateWorkspace();

	const authorPrefix = gitAuthor?.prefix;
	const generatedBranchName = generateBranchFromTitle({ title, authorPrefix });

	const filteredBranches = useMemo(() => {
		if (!branchData?.branches) return [];
		if (!branchSearch) return branchData.branches;
		const searchLower = branchSearch.toLowerCase();
		return branchData.branches.filter((b) =>
			b.name.toLowerCase().includes(searchLower),
		);
	}, [branchData?.branches, branchSearch]);

	const effectiveBaseBranch = resolveEffectiveWorkspaceBaseBranch({
		explicitBaseBranch: baseBranch,
		workspaceBaseBranch: project?.workspaceBaseBranch,
		defaultBranch: branchData?.defaultBranch,
		branches: branchData?.branches,
	});

	const setupCommands = useMemo(
		() => splitCommands(setupContent),
		[setupContent],
	);
	const teardownCommands = useMemo(
		() => splitCommands(teardownContent),
		[teardownContent],
	);

	useEffect(() => {
		const timer = setTimeout(() => {
			titleInputRef.current?.focus();
		}, 100);
		return () => clearTimeout(timer);
	}, []);

	useEffect(() => {
		if (
			configData === undefined ||
			setupDefaults === undefined ||
			hasInitializedSetup
		) {
			return;
		}

		const parsed = parseConfigContent(configData?.content ?? null);

		if (parsed.setup.length > 0 || parsed.teardown.length > 0) {
			setSetupMode("custom");
			setSetupContent(parsed.setup.join("\n"));
			setTeardownContent(parsed.teardown.join("\n"));
		} else {
			setSetupMode("checklist");
			setActions(setupDefaults.actions);
		}

		setHasInitializedSetup(true);
	}, [configData, setupDefaults, hasInitializedSetup]);

	const canContinueFromWorkspace = generatedBranchName.length > 0;

	const handleCreateWorkspace = async () => {
		const workspaceName = title.trim() || undefined;

		try {
			await createWorkspace.mutateAsync({
				projectId,
				name: workspaceName,
				branchName: generatedBranchName || undefined,
				baseBranch: baseBranch || undefined,
			});

			toast.success("Workspace created", {
				description: "Setting up in the background...",
			});
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to create workspace",
			);
		}
	};

	const handleContinueToSetup = () => {
		if (!canContinueFromWorkspace) return;
		setStep("setup");
	};

	const handleSaveAndCreateWorkspace = async () => {
		const commands =
			setupMode === "checklist"
				? actions.filter((a) => a.enabled).map((a) => a.command)
				: setupCommands;

		if (commands.length === 0) {
			await handleCreateWorkspace();
			return;
		}

		try {
			await updateConfigMutation.mutateAsync({
				projectId,
				setup: commands,
				teardown: teardownCommands,
			});

			await handleCreateWorkspace();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to save setup config",
			);
		}
	};

	const handleSkipSetupAndCreateWorkspace = async () => {
		await handleCreateWorkspace();
	};

	const toggleAction = (id: string) => {
		setActions((prev) =>
			prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)),
		);
	};

	const switchToCustom = () => {
		const prePopulated = actions
			.filter((a) => a.enabled)
			.map((a) => a.command)
			.join("\n");
		setSetupContent(prePopulated);
		setSetupMode("custom");
	};

	if (!project) {
		return null;
	}

	return (
		<div className="flex-1 h-full flex flex-col overflow-hidden bg-background">
			<AnimatePresence>
				<ExternalWorktreesBanner projectId={projectId} />
			</AnimatePresence>

			<div className="flex-1 flex overflow-y-auto">
				<div className="flex-1 flex items-center justify-center px-6 py-8">
					<div className="w-full max-w-3xl space-y-6">
						<div className="space-y-1.5">
							<p className="text-xs uppercase tracking-wide text-muted-foreground">
								Step {step === "workspace" ? 1 : 2} of 2
							</p>
							<h1 className="text-2xl font-semibold text-foreground">
								{step === "workspace" && "Create your first workspace"}
								{step === "setup" && "Setup script"}
							</h1>
							<p className="text-sm text-muted-foreground">
								{step === "workspace" &&
									"Workspaces are isolated task environments backed by git worktrees."}
								{step === "setup" && (
									<>
										These commands run automatically when a workspace is
										created.{" "}
										<a
											href="https://docs.superset.sh/setup-teardown-scripts"
											target="_blank"
											rel="noopener noreferrer"
											className="group inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground transition-colors"
										>
											Read our docs
											<HiChevronRight className="size-3 transition-transform duration-150 group-hover:translate-x-0.5" />
										</a>
									</>
								)}
							</p>
						</div>

						<AnimatePresence mode="wait" initial={false}>
							{step === "workspace" && (
								<motion.div
									key="workspace-step"
									initial={{ opacity: 0, y: 6 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: -6 }}
									transition={{ duration: 0.16, ease: "easeOut" }}
									className="space-y-4"
								>
									<div className="space-y-2">
										<Label htmlFor="task-title">Task</Label>
										<Input
											id="task-title"
											ref={titleInputRef}
											className="h-11"
											placeholder="e.g. Add dark mode, Fix checkout bug"
											value={title}
											onChange={(e) => setTitle(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter" && !e.shiftKey) {
													e.preventDefault();
													handleContinueToSetup();
												}
											}}
										/>
									</div>

									<div className="rounded-md border border-border/60 bg-card/40 px-3 py-2 text-sm">
										<div className="flex items-center gap-2 text-muted-foreground">
											<GoGitBranch className="size-3.5" />
											<span className="font-mono">
												{generatedBranchName || "branch-name"}
											</span>
											<span className="text-muted-foreground/50">from</span>
											<span className="font-mono">{effectiveBaseBranch}</span>
										</div>
									</div>

									<Collapsible
										open={showAdvanced}
										onOpenChange={setShowAdvanced}
									>
										<CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground/80 hover:text-muted-foreground transition-colors py-1">
											<HiChevronDown
												className={`size-3 transition-transform duration-200 ${showAdvanced ? "" : "-rotate-90"}`}
											/>
											Advanced options
										</CollapsibleTrigger>
										<AnimatePresence initial={false}>
											{showAdvanced && (
												<motion.div
													initial={{ height: 0, opacity: 0 }}
													animate={{ height: "auto", opacity: 1 }}
													exit={{ height: 0, opacity: 0 }}
													transition={{ duration: 0.2, ease: "easeInOut" }}
													className="overflow-hidden"
												>
													<div className="pt-3 space-y-2">
														<span className="text-xs font-medium text-muted-foreground">
															Base branch
														</span>
														{isBranchesError ? (
															<div className="flex items-center gap-2 h-10 px-3 rounded-md border border-destructive/50 bg-destructive/10 text-destructive text-sm">
																Failed to load branches
															</div>
														) : (
															<Popover
																open={baseBranchOpen}
																onOpenChange={setBaseBranchOpen}
																modal={false}
															>
																<PopoverTrigger asChild>
																	<Button
																		variant="outline"
																		className="w-full h-10 justify-between font-normal"
																		disabled={isBranchesLoading}
																	>
																		<span className="flex items-center gap-2 truncate">
																			<GoGitBranch className="size-3.5 shrink-0 text-muted-foreground" />
																			<span className="truncate font-mono text-sm">
																				{effectiveBaseBranch ||
																					"Select branch..."}
																			</span>
																			{effectiveBaseBranch ===
																				branchData?.defaultBranch && (
																				<span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
																					default
																				</span>
																			)}
																		</span>
																		<HiChevronUpDown className="size-4 shrink-0 text-muted-foreground" />
																	</Button>
																</PopoverTrigger>
																<PopoverContent
																	className="w-[--radix-popover-trigger-width] p-0"
																	align="start"
																	onWheel={(e) => e.stopPropagation()}
																>
																	<Command shouldFilter={false}>
																		<CommandInput
																			placeholder="Search branches..."
																			value={branchSearch}
																			onValueChange={setBranchSearch}
																		/>
																		<CommandList className="max-h-[200px]">
																			<CommandEmpty>
																				No branches found
																			</CommandEmpty>
																			{filteredBranches.map((branch) => (
																				<CommandItem
																					key={branch.name}
																					value={branch.name}
																					onSelect={() => {
																						setBaseBranch(branch.name);
																						setBaseBranchOpen(false);
																						setBranchSearch("");
																					}}
																					className="flex items-center justify-between"
																				>
																					<span className="flex items-center gap-2 truncate">
																						<GoGitBranch className="size-3.5 shrink-0 text-muted-foreground" />
																						<span className="truncate">
																							{branch.name}
																						</span>
																						{branch.name ===
																							branchData?.defaultBranch && (
																							<span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
																								default
																							</span>
																						)}
																					</span>
																					<span className="flex items-center gap-2 shrink-0">
																						{branch.lastCommitDate > 0 && (
																							<span className="text-xs text-muted-foreground">
																								{formatRelativeTime(
																									branch.lastCommitDate,
																								)}
																							</span>
																						)}
																						{effectiveBaseBranch ===
																							branch.name && (
																							<HiCheck className="size-4 text-primary" />
																						)}
																					</span>
																				</CommandItem>
																			))}
																		</CommandList>
																	</Command>
																</PopoverContent>
															</Popover>
														)}
													</div>
												</motion.div>
											)}
										</AnimatePresence>
									</Collapsible>

									<div className="flex justify-end">
										<Button
											onClick={handleContinueToSetup}
											disabled={!canContinueFromWorkspace}
										>
											Continue
											<HiChevronRight className="size-4" />
										</Button>
									</div>
								</motion.div>
							)}

							{step === "setup" && (
								<motion.div
									key="setup-step"
									initial={{ opacity: 0, y: 6 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: -6 }}
									transition={{ duration: 0.16, ease: "easeOut" }}
									className="space-y-4"
								>
									{setupMode === "checklist" && actions.length > 0 && (
										<div className="space-y-3">
											{setupDefaults?.projectSummary && (
												<p className="text-sm text-muted-foreground">
													{setupDefaults.projectSummary}
												</p>
											)}
											<div className="overflow-hidden rounded-lg border bg-card/40 divide-y divide-border/60">
												{actions.map((action) => (
													<label
														key={action.id}
														htmlFor={`action-${action.id}`}
														className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors cursor-pointer"
													>
														<Checkbox
															id={`action-${action.id}`}
															checked={action.enabled}
															onCheckedChange={() => toggleAction(action.id)}
														/>
														<div className="flex flex-col min-w-0">
															<span className="text-sm text-foreground">
																{action.label}
															</span>
															<span className="text-xs text-muted-foreground font-mono truncate">
																{action.detail}
															</span>
														</div>
													</label>
												))}
											</div>
											<button
												type="button"
												onClick={switchToCustom}
												className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
											>
												Customize commands
											</button>
										</div>
									)}

									{setupMode === "checklist" && actions.length === 0 && (
										<div className="overflow-hidden rounded-lg border bg-card/40 p-6 text-center space-y-3">
											<p className="text-sm text-muted-foreground">
												We couldn't detect a package manager or environment
												config.
											</p>
											<div className="flex items-center justify-center gap-2">
												<Button
													variant="outline"
													size="sm"
													onClick={() => setSetupMode("custom")}
												>
													Add commands
												</Button>
												<Button
													variant="ghost"
													size="sm"
													onClick={handleSkipSetupAndCreateWorkspace}
													disabled={
														updateConfigMutation.isPending ||
														createWorkspace.isPending
													}
												>
													Skip
												</Button>
											</div>
										</div>
									)}

									{setupMode === "custom" && (
										<div className="space-y-3">
											{actions.length > 0 && (
												<button
													type="button"
													onClick={() => setSetupMode("checklist")}
													className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
												>
													Back to checklist
												</button>
											)}
											<div className="overflow-hidden rounded-lg border bg-card/40">
												<div className="p-3 space-y-3">
													<Textarea
														id="setup-script"
														wrap="off"
														className="h-full min-h-[220px] resize-none overflow-x-auto whitespace-pre font-mono text-xs"
														placeholder="Add setup commands, one per line..."
														value={setupContent}
														onChange={(e) => setSetupContent(e.target.value)}
													/>
													<div className="flex flex-wrap items-center gap-1.5 border-t px-1 pt-2 text-[11px] text-muted-foreground">
														<span className="mr-1">Variables</span>
														<span className="rounded bg-muted px-1.5 py-0.5 font-mono">
															$SUPERSET_ROOT_PATH
														</span>
														<span className="rounded bg-muted px-1.5 py-0.5 font-mono">
															$SUPERSET_WORKSPACE_PATH
														</span>
														<span className="rounded bg-muted px-1.5 py-0.5 font-mono">
															$SUPERSET_WORKSPACE_NAME
														</span>
													</div>
												</div>
											</div>
										</div>
									)}

									<Collapsible
										open={teardownOpen}
										onOpenChange={setTeardownOpen}
									>
										<CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground/80 hover:text-muted-foreground transition-colors py-1">
											<HiChevronDown
												className={`size-3 transition-transform duration-200 ${teardownOpen ? "" : "-rotate-90"}`}
											/>
											Teardown commands (optional)
										</CollapsibleTrigger>
										<CollapsibleContent className="pt-2">
											<Textarea
												id="teardown-script"
												className="min-h-20 font-mono text-xs"
												placeholder="docker compose down"
												value={teardownContent}
												onChange={(e) => setTeardownContent(e.target.value)}
											/>
										</CollapsibleContent>
									</Collapsible>

									<div className="flex justify-between">
										<Button
											variant="outline"
											onClick={() => setStep("workspace")}
										>
											<HiChevronLeft className="size-4" />
											Back
										</Button>
										<div className="flex items-center gap-2">
											<Button
												variant="outline"
												onClick={handleSkipSetupAndCreateWorkspace}
												disabled={
													updateConfigMutation.isPending ||
													createWorkspace.isPending
												}
											>
												Skip for now
											</Button>
											<Button
												onClick={handleSaveAndCreateWorkspace}
												disabled={
													updateConfigMutation.isPending ||
													createWorkspace.isPending
												}
											>
												{updateConfigMutation.isPending ||
												createWorkspace.isPending
													? "Creating..."
													: setupMode === "checklist"
														? "Create workspace"
														: "Save & create workspace"}
												<HiChevronRight className="size-4" />
											</Button>
										</div>
									</div>
								</motion.div>
							)}
						</AnimatePresence>
					</div>
				</div>
			</div>
		</div>
	);
}

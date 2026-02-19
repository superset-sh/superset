import { Button } from "@superset/ui/button";
import { Collapsible, CollapsibleTrigger } from "@superset/ui/collapsible";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Input } from "@superset/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { toast } from "@superset/ui/sonner";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { GoGitBranch } from "react-icons/go";
import { HiCheck, HiChevronDown, HiChevronUpDown } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
import { electronTrpcClient as trpcClient } from "renderer/lib/trpc-client";
import { useCreateWorkspace } from "renderer/react-query/workspaces";
import { NotFound } from "renderer/routes/not-found";
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

	const createWorkspace = useCreateWorkspace();
	const authorPrefix = gitAuthor?.prefix;

	const [title, setTitle] = useState("");
	const [baseBranch, setBaseBranch] = useState<string | null>(null);
	const [baseBranchOpen, setBaseBranchOpen] = useState(false);
	const [branchSearch, setBranchSearch] = useState("");
	const [showAdvanced, setShowAdvanced] = useState(false);
	const titleInputRef = useRef<HTMLInputElement>(null);

	const filteredBranches = useMemo(() => {
		if (!branchData?.branches) return [];
		if (!branchSearch) return branchData.branches;
		const searchLower = branchSearch.toLowerCase();
		return branchData.branches.filter((b) =>
			b.name.toLowerCase().includes(searchLower),
		);
	}, [branchData?.branches, branchSearch]);

	const effectiveBaseBranch = baseBranch ?? branchData?.defaultBranch ?? null;

	useEffect(() => {
		const timer = setTimeout(() => {
			titleInputRef.current?.focus();
		}, 100);
		return () => clearTimeout(timer);
	}, []);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey && !createWorkspace.isPending) {
			e.preventDefault();
			handleCreateWorkspace();
		}
	};

	const handleCreateWorkspace = async () => {
		const workspaceName = title.trim() || undefined;
		const generatedBranchName = generateBranchFromTitle({
			title,
			authorPrefix,
		});

		try {
			await createWorkspace.mutateAsync({
				projectId,
				name: workspaceName,
				branchName: generatedBranchName || undefined,
				baseBranch: effectiveBaseBranch || undefined,
			});

			toast.success("Workspace created", {
				description: "Setting up in the background...",
			});
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to create workspace",
			);
		}
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
				<div className="flex-1 flex items-center justify-center">
					<div role="form" className="w-full max-w-md mx-6" onKeyDown={handleKeyDown}>
						<h1 className="text-3xl font-semibold text-foreground tracking-tight mb-2">
							Create your first workspace
						</h1>

						<p className="text-sm text-muted-foreground leading-relaxed mb-8">
							Each workspace is an isolated copy of your codebase.
							<br />
							Work on multiple tasks without conflicts.
						</p>

						<div className="space-y-4">
							<div className="space-y-2">
								<Input
									id="task-title"
									ref={titleInputRef}
									className="h-11 text-base bg-card/50 border-border/60 focus:border-primary/40 focus:ring-primary/20 transition-all"
									placeholder="e.g. Add dark mode, Fix checkout bug"
									value={title}
									onChange={(e) => setTitle(e.target.value)}
								/>
							</div>

							<p
								className={`text-xs text-muted-foreground flex items-center gap-2 transition-all duration-200 ${title ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"}`}
							>
								<GoGitBranch className="size-3" />
								<span className="font-mono">
									{generateBranchFromTitle({ title, authorPrefix }) ||
										"branch-name"}
								</span>
								<span className="text-muted-foreground/50">
									from {effectiveBaseBranch}
								</span>
							</p>

							<Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
								<CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors py-1">
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
																className="w-full h-10 justify-between font-normal bg-card/50 border-border/60 hover:border-primary/40 transition-colors"
																disabled={isBranchesLoading}
															>
																<span className="flex items-center gap-2 truncate">
																	<GoGitBranch className="size-3.5 shrink-0 text-muted-foreground" />
																	<span className="truncate font-mono text-sm">
																		{effectiveBaseBranch || "Select branch..."}
																	</span>
																	{effectiveBaseBranch ===
																		branchData?.defaultBranch && (
																		<span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
																			default
																		</span>
																	)}
																</span>
																<HiChevronUpDown className="size-3.5 shrink-0 text-muted-foreground" />
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
																	<CommandEmpty>No branches found</CommandEmpty>
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

							<Button
								size="lg"
								className="w-full mt-2 h-11 text-sm font-medium transition-all hover:scale-[1.01] active:scale-[0.99]"
								onClick={handleCreateWorkspace}
								disabled={createWorkspace.isPending || isBranchesError}
							>
								{createWorkspace.isPending ? "Creating..." : "Create workspace"}
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

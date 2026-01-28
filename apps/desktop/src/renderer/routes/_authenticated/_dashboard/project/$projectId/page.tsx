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
	if (!title.trim()) return "";

	const slug = title
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 50);

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
			<div className="flex-1 flex overflow-y-auto">
				{/* Main content */}
				<div className="flex-1 flex items-center justify-center py-12">
					{/* biome-ignore lint/a11y/noStaticElementInteractions: Form container handles Enter key for submission */}
					<div className="w-full max-w-xl" onKeyDown={handleKeyDown}>
						{/* Project context */}
						<div className="flex items-center gap-2 mb-6">
							<span className="text-sm text-muted-foreground">
								{project.name}
							</span>
							<span className="text-muted-foreground/30">·</span>
							<span className="text-sm text-muted-foreground/70 font-mono">
								{branchData?.defaultBranch ?? "main"}
							</span>
						</div>

						{/* Headline */}
						<h1 className="text-4xl font-semibold text-foreground tracking-tight mb-3">
							What are you building?
						</h1>

						{/* Subtext */}
						<p className="text-lg text-muted-foreground mb-10">
							Each workspace is an isolated copy of your codebase. Work on
							multiple tasks without conflicts.
						</p>

						{/* Form */}
						<div className="space-y-4 max-w-md">
							<div className="space-y-1.5">
								<label
									htmlFor="task-title"
									className="text-sm text-muted-foreground"
								>
									Name your task
								</label>
								<Input
									id="task-title"
									ref={titleInputRef}
									className="h-12 text-base"
									placeholder="e.g. Add dark mode, Fix checkout bug"
									value={title}
									onChange={(e) => setTitle(e.target.value)}
								/>
							</div>

							<p
								className={`text-sm text-muted-foreground flex items-center gap-2 transition-opacity ${title ? "opacity-100" : "opacity-0"}`}
							>
								<GoGitBranch className="size-3.5" />
								<span className="font-mono">
									{generateBranchFromTitle({ title, authorPrefix }) ||
										"branch-name"}
								</span>
								<span className="text-muted-foreground/50">
									from {effectiveBaseBranch}
								</span>
							</p>

							<Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
								<CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
									<HiChevronDown
										className={`size-3.5 transition-transform ${showAdvanced ? "" : "-rotate-90"}`}
									/>
									Advanced
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
											<div className="pt-4 space-y-2">
												<span className="text-sm text-muted-foreground">
													Change base branch
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
																	<GoGitBranch className="size-4 shrink-0 text-muted-foreground" />
																	<span className="truncate font-mono">
																		{effectiveBaseBranch || "Select branch..."}
																	</span>
																	{effectiveBaseBranch ===
																		branchData?.defaultBranch && (
																		<span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
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
								className="w-full"
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

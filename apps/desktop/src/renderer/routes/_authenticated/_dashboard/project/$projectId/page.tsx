import { Button } from "@superset/ui/button";
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
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { toast } from "@superset/ui/sonner";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { GoGitBranch } from "react-icons/go";
import { HiCheck, HiChevronDown, HiChevronUpDown } from "react-icons/hi2";
import { LuArrowRight } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
import { electronTrpcClient as trpcClient } from "renderer/lib/trpc-client";
import {
	useCreateBranchWorkspace,
	useCreateWorkspace,
} from "renderer/react-query/workspaces";
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

function generateBranchFromTitle(title: string): string {
	if (!title.trim()) return "";

	return title
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 50);
}

function ProjectPage() {
	const { projectId } = Route.useParams();
	const navigate = useNavigate();

	const { data: project } = electronTrpc.projects.get.useQuery({
		id: projectId,
	});
	const { data: workspacesData } =
		electronTrpc.workspaces.getAllGrouped.useQuery();
	const {
		data: branchData,
		isLoading: isBranchesLoading,
		isError: isBranchesError,
	} = electronTrpc.projects.getBranches.useQuery(
		{ projectId },
		{ enabled: !!projectId },
	);

	const createWorkspace = useCreateWorkspace();
	const createBranchWorkspace = useCreateBranchWorkspace();

	const [title, setTitle] = useState("");
	const [branchName, setBranchName] = useState("");
	const [branchNameEdited, setBranchNameEdited] = useState(false);
	const [baseBranch, setBaseBranch] = useState<string | null>(null);
	const [baseBranchOpen, setBaseBranchOpen] = useState(false);
	const [branchSearch, setBranchSearch] = useState("");
	const [showAdvanced, setShowAdvanced] = useState(false);
	const titleInputRef = useRef<HTMLInputElement>(null);

	// Get existing workspaces for this project
	const projectWorkspaces = useMemo(() => {
		if (!workspacesData) return [];
		const projectGroup = workspacesData.find((g) => g.project.id === projectId);
		return projectGroup?.workspaces ?? [];
	}, [workspacesData, projectId]);

	// Filter branches based on search
	const filteredBranches = useMemo(() => {
		if (!branchData?.branches) return [];
		if (!branchSearch) return branchData.branches;
		const searchLower = branchSearch.toLowerCase();
		return branchData.branches.filter((b) =>
			b.name.toLowerCase().includes(searchLower),
		);
	}, [branchData?.branches, branchSearch]);

	// Effective base branch
	const effectiveBaseBranch = baseBranch ?? branchData?.defaultBranch ?? null;

	// Auto-generate branch name from title
	useEffect(() => {
		if (!branchNameEdited) {
			setBranchName(generateBranchFromTitle(title));
		}
	}, [title, branchNameEdited]);

	// Focus title input on mount
	useEffect(() => {
		const timer = setTimeout(() => {
			titleInputRef.current?.focus();
		}, 100);
		return () => clearTimeout(timer);
	}, []);

	const handleBranchNameChange = (value: string) => {
		setBranchName(value);
		setBranchNameEdited(true);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey && !createWorkspace.isPending) {
			e.preventDefault();
			handleCreateWorkspace();
		}
	};

	const handleCreateWorkspace = async () => {
		const workspaceName = title.trim() || undefined;
		const customBranchName = branchName.trim() || undefined;

		try {
			await createWorkspace.mutateAsync({
				projectId,
				name: workspaceName,
				branchName: customBranchName,
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

	const handleOpenMainBranch = () => {
		createBranchWorkspace.mutate(
			{ projectId },
			{
				onError: (err) => {
					toast.error(err.message || "Failed to open main branch");
				},
			},
		);
	};

	if (!project) {
		return null;
	}

	return (
		<div className="flex-1 h-full flex flex-col overflow-hidden bg-background">
			<div className="flex-1 flex items-center justify-center p-8">
				{/* biome-ignore lint/a11y/noStaticElementInteractions: Form container handles Enter key for submission */}
				<div className="w-full max-w-lg" onKeyDown={handleKeyDown}>
					{/* Project Header */}
					<div className="text-center mb-8">
						<h1 className="text-xl font-semibold text-foreground mb-1">
							{project.name}
						</h1>
						<p className="text-sm text-muted-foreground">
							{branchData?.defaultBranch ?? "main"} •{" "}
							{branchData?.branches?.length ?? 0} branches
						</p>
					</div>

					{/* Value Prop */}
					<div className="text-center mb-8">
						<p className="text-sm text-foreground mb-2">
							Superset keeps your work organized.
						</p>
						<p className="text-xs text-muted-foreground leading-relaxed">
							Each workspace is an isolated copy of your repo. Switch between
							tasks without stashing, losing context, or breaking your build.
						</p>
					</div>

					{/* Workspace Creation Form */}
					<div className="rounded-lg border border-border bg-card p-5 space-y-4">
						<div>
							<label
								htmlFor="feature-name"
								className="block text-sm font-medium text-foreground mb-2"
							>
								What are you working on?
							</label>
							<Input
								ref={titleInputRef}
								id="feature-name"
								className="h-10"
								placeholder="Add dark mode support"
								value={title}
								onChange={(e) => setTitle(e.target.value)}
							/>
						</div>

						{title && !showAdvanced && (
							<p className="text-xs text-muted-foreground flex items-center gap-1.5">
								<GoGitBranch className="size-3" />
								<span className="font-mono">
									{branchName || generateBranchFromTitle(title)}
								</span>
								<span className="text-muted-foreground/60">
									from {effectiveBaseBranch}
								</span>
							</p>
						)}

						<Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
							<CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
								<HiChevronDown
									className={`size-3 transition-transform ${showAdvanced ? "" : "-rotate-90"}`}
								/>
								Advanced options
							</CollapsibleTrigger>
							<CollapsibleContent className="pt-3 space-y-3">
								<div className="space-y-1.5">
									<label
										htmlFor="branch"
										className="text-xs text-muted-foreground"
									>
										Branch name
									</label>
									<Input
										id="branch"
										className="h-8 text-sm font-mono"
										placeholder={
											title ? generateBranchFromTitle(title) : "auto-generated"
										}
										value={branchName}
										onChange={(e) => handleBranchNameChange(e.target.value)}
									/>
								</div>

								<div className="space-y-1.5">
									<span className="text-xs text-muted-foreground">
										Base branch
									</span>
									{isBranchesError ? (
										<div className="flex items-center gap-2 h-8 px-3 rounded-md border border-destructive/50 bg-destructive/10 text-destructive text-xs">
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
													size="sm"
													className="w-full h-8 justify-between font-normal"
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
																	{effectiveBaseBranch === branch.name && (
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
							</CollapsibleContent>
						</Collapsible>

						<Button
							className="w-full"
							onClick={handleCreateWorkspace}
							disabled={createWorkspace.isPending || isBranchesError}
						>
							{createWorkspace.isPending ? "Creating..." : "Create workspace"}
						</Button>
					</div>

					{/* Open main branch link */}
					<div className="text-center mt-4">
						<button
							type="button"
							onClick={handleOpenMainBranch}
							disabled={createBranchWorkspace.isPending}
							className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
						>
							Just want to browse? Open {branchData?.defaultBranch ?? "main"}{" "}
							branch
							<LuArrowRight className="size-3" />
						</button>
					</div>

					{/* Existing Workspaces */}
					{projectWorkspaces.length > 0 && (
						<div className="mt-8 pt-6 border-t border-border">
							<h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
								Existing Workspaces
							</h3>
							<div className="space-y-1">
								{projectWorkspaces.map((workspace) => (
									<button
										key={workspace.id}
										type="button"
										onClick={() =>
											navigate({
												to: "/workspace/$workspaceId",
												params: { workspaceId: workspace.id },
											})
										}
										className="w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent/50 transition-colors text-left"
									>
										<span className="text-sm text-foreground truncate">
											{workspace.name}
										</span>
										<span className="text-xs text-muted-foreground flex items-center gap-1.5">
											<GoGitBranch className="size-3" />
											{workspace.branch}
										</span>
									</button>
								))}
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

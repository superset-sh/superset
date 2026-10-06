import { Trans, useLingui } from "@lingui/react/macro";
import { formatList } from "@superset/i18n/format";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMemo, useState } from "react";
import {
	LuChevronDown,
	LuFolderInput,
	LuPlus,
	LuRefreshCw,
	LuSearch,
} from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { CardGridSkeleton } from "../CardGridSkeleton";
import { DeleteSkillDialog } from "./components/DeleteSkillDialog";
import { NewSkillDialog } from "./components/NewSkillDialog";
import { ProjectSwitcher } from "./components/ProjectSwitcher";
import { SkillGrid } from "./components/SkillGrid";
import { SkillPreviewDialog } from "./components/SkillPreviewDialog";
import {
	type CreateSkillInput,
	type SkillLocation,
	useSkillMutations,
} from "./hooks/useSkillMutations";
import {
	type SkillListItem,
	type SkillScope,
	useSkills,
} from "./hooks/useSkills";

const INSTALLED_PREVIEW_COUNT = 6;

const SCOPE_TAB_CLASS =
	"h-8 flex-none rounded-full border-transparent px-3 text-muted-foreground shadow-none data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-muted";

export function SkillsView() {
	const { t } = useLingui();
	const [search, setSearch] = useState("");
	const [scope, setScope] = useState<SkillScope>("project");
	const [projectId, setProjectId] = useState<string | null>(null);
	const [showAllInstalled, setShowAllInstalled] = useState(false);
	const [previewId, setPreviewId] = useState<string | null>(null);
	const [isNewOpen, setIsNewOpen] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<SkillListItem | null>(null);

	const projectsQuery = electronTrpc.projects.getRecents.useQuery();
	const projects = useMemo(
		() =>
			(projectsQuery.data ?? []).map((project) => ({
				id: project.id,
				name: project.name,
			})),
		[projectsQuery.data],
	);
	const selectedProjectId = projectId ?? projects[0]?.id ?? null;

	const {
		skills,
		project,
		personalRoot,
		isLoading,
		isRefetching,
		error,
		refetch,
	} = useSkills({
		projectId: selectedProjectId,
		enabled: !projectsQuery.isPending,
	});
	const { setEnabled, create, importFromFolder, remove, isBusy } =
		useSkillMutations();

	const query = search.trim().toLowerCase();
	const visible = useMemo(() => {
		if (query === "") return skills;
		return skills.filter((skill) =>
			[
				skill.name,
				skill.displayName,
				skill.description,
				skill.shortDescription ?? "",
			]
				.join(" ")
				.toLowerCase()
				.includes(query),
		);
	}, [skills, query]);
	const inScope = (target: SkillScope) =>
		visible.filter((skill) => skill.scope === target);
	const duplicateNames = useMemo(() => {
		const counts = new Map<string, number>();
		for (const skill of skills) {
			counts.set(skill.name, (counts.get(skill.name) ?? 0) + 1);
		}
		return new Set(
			[...counts].filter(([, count]) => count > 1).map(([name]) => name),
		);
	}, [skills]);

	const isSearching = query !== "";
	const installed =
		showAllInstalled || isSearching
			? visible
			: visible.slice(0, INSTALLED_PREVIEW_COUNT);
	const folded = visible.slice(INSTALLED_PREVIEW_COUNT);
	const foldedNames = folded.slice(0, 2).map((skill) => skill.displayName);
	const foldedRest = folded.length - foldedNames.length;
	const foldedList = formatList(
		foldedRest > 0
			? [...foldedNames, t({ message: `${foldedRest} more` })]
			: foldedNames,
	);

	const previewSkill = skills.find((skill) => skill.id === previewId) ?? null;

	const location: SkillLocation =
		scope === "project" && selectedProjectId
			? { scope: "project", projectId: selectedProjectId }
			: { scope: "personal" };

	const handleCreate = async (input: CreateSkillInput) => {
		const created = await create(input);
		if (!created) return false;
		setScope(created.scope);
		setPreviewId(created.id);
		return true;
	};

	const handleImport = async () => {
		const result = await importFromFolder(location);
		if (result && !result.canceled) {
			setScope(result.skill.scope);
			setPreviewId(result.skill.id);
		}
	};

	const handleDelete = async (skill: SkillListItem) => {
		if (!(await remove(skill))) return;
		setDeleteTarget(null);
		if (previewId === skill.id) setPreviewId(null);
	};

	const gridActions = {
		isBusy,
		duplicateNames,
		onOpen: (skill: SkillListItem) => setPreviewId(skill.id),
		onDelete: setDeleteTarget,
		onSetEnabled: setEnabled,
	};

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="text-2xl font-semibold text-foreground">
						<Trans>Skills</Trans>
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						<Trans>
							Reusable instructions your agents pick up automatically
						</Trans>
					</p>
				</div>
				<div className="flex items-center gap-2">
					<div className="relative">
						<LuSearch className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder={t({ message: "Search skills" })}
							className="w-56 rounded-full pl-9"
						/>
					</div>
					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon-sm"
								className="text-muted-foreground"
								aria-label={t({ message: "Refresh skills" })}
								disabled={isRefetching}
								onClick={() => void refetch()}
							>
								<LuRefreshCw
									className={cn("size-4", isRefetching && "animate-spin")}
								/>
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							<Trans>Refresh</Trans>
						</TooltipContent>
					</Tooltip>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button size="sm" className="rounded-full">
								<Trans>Add</Trans>
								<LuChevronDown className="size-3.5" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onSelect={() => setIsNewOpen(true)}>
								<LuPlus className="size-4" />
								<Trans>New skill…</Trans>
							</DropdownMenuItem>
							<DropdownMenuItem
								disabled={isBusy}
								onSelect={() => void handleImport()}
							>
								<LuFolderInput className="size-4" />
								<Trans>Import from folder…</Trans>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			{isLoading && <CardGridSkeleton />}

			{error && (
				<p className="py-8 text-center text-sm text-muted-foreground">
					<Trans>Could not load skills. Refresh to try again.</Trans>
				</p>
			)}

			{!isLoading && !error && (
				<>
					<section className="flex flex-col gap-3">
						<h2 className="border-b border-border/60 pb-2 text-sm font-semibold text-foreground">
							<Trans>Installed</Trans>
						</h2>
						<SkillGrid
							skills={installed}
							showScope
							emptyMessage={
								isSearching ? (
									<Trans>No skills match "{search.trim()}"</Trans>
								) : (
									<Trans>No skills yet. Add one to get started.</Trans>
								)
							}
							{...gridActions}
						/>
						{!showAllInstalled && !isSearching && folded.length > 0 && (
							<button
								type="button"
								onClick={() => setShowAllInstalled(true)}
								className="self-start px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
							>
								<Trans>See {foldedList}</Trans>
							</button>
						)}
					</section>

					<Tabs
						value={scope}
						onValueChange={(value) => setScope(value as SkillScope)}
						className="gap-4"
					>
						<TabsList className="h-auto gap-1 bg-transparent p-0">
							<TabsTrigger value="project" className={SCOPE_TAB_CLASS}>
								{project?.name ?? <Trans>Project</Trans>}
							</TabsTrigger>
							<TabsTrigger value="personal" className={SCOPE_TAB_CLASS}>
								<Trans>Personal</Trans>
							</TabsTrigger>
							<TabsTrigger value="system" className={SCOPE_TAB_CLASS}>
								<Trans>System</Trans>
							</TabsTrigger>
						</TabsList>

						<TabsContent value="project" className="flex flex-col gap-3">
							<div className="flex min-h-8 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
								<ProjectSwitcher
									projects={projects}
									selectedId={selectedProjectId}
									onSelect={setProjectId}
								/>
								{project && (
									<span className="font-mono">{project.skillsRoot}</span>
								)}
							</div>
							<SkillGrid
								skills={inScope("project")}
								emptyMessage={
									projects.length === 0 ? (
										<Trans>Open a project to see its skills.</Trans>
									) : isSearching ? (
										<Trans>No skills match "{search.trim()}"</Trans>
									) : (
										<Trans>
											No skills in this project yet. Add one and every agent
											working in it can use it.
										</Trans>
									)
								}
								{...gridActions}
							/>
						</TabsContent>

						<TabsContent value="personal" className="flex flex-col gap-3">
							<div className="flex min-h-8 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
								<span>
									<Trans>Yours in every project, on this machine.</Trans>
								</span>
								{personalRoot && (
									<span className="font-mono">{personalRoot}</span>
								)}
							</div>
							<SkillGrid
								skills={inScope("personal")}
								emptyMessage={
									isSearching ? (
										<Trans>No skills match "{search.trim()}"</Trans>
									) : (
										<Trans>No personal skills yet.</Trans>
									)
								}
								{...gridActions}
							/>
						</TabsContent>

						<TabsContent value="system" className="flex flex-col gap-3">
							<p className="min-h-8 text-xs text-muted-foreground">
								<Trans>
									Ship with Superset and stay up to date in every agent you use.
									Switch one off to keep it out of new sessions.
								</Trans>
							</p>
							<SkillGrid
								skills={inScope("system")}
								emptyMessage={<Trans>No skills match "{search.trim()}"</Trans>}
								{...gridActions}
							/>
						</TabsContent>
					</Tabs>
				</>
			)}

			<SkillPreviewDialog
				skill={previewSkill}
				isBusy={isBusy}
				onClose={() => setPreviewId(null)}
				onDelete={setDeleteTarget}
				onSetEnabled={setEnabled}
			/>
			{isNewOpen && (
				<NewSkillDialog
					defaultLocation={location}
					projects={projects}
					personalRoot={personalRoot}
					isBusy={isBusy}
					onClose={() => setIsNewOpen(false)}
					onSubmit={handleCreate}
				/>
			)}
			<DeleteSkillDialog
				skill={deleteTarget}
				isBusy={isBusy}
				onClose={() => setDeleteTarget(null)}
				onConfirm={(skill) => void handleDelete(skill)}
			/>
		</div>
	);
}

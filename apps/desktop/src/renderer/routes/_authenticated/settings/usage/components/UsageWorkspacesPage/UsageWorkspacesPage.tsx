import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { Input } from "@superset/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { LuArrowLeft, LuX } from "react-icons/lu";
import { useHostUsageHistory } from "../../hooks/useHostUsageHistory";
import type { HistoryMetric } from "../UsageHistorySection/constants";
import { RANGE_OPTIONS } from "../UsageHistorySection/constants";
import {
	formatTokens,
	formatUsd,
} from "../UsageHistorySection/utils/formatUsage";
import type { ProjectRow } from "../WorkspaceUsageRow";
import { WorkspaceUsageRow } from "../WorkspaceUsageRow";

type KindFilter = "all" | ProjectRow["kind"];
type ViewMode = "workspaces" | "projects";

const KIND_FILTERS: Array<{ value: KindFilter; label: MessageDescriptor }> = [
	{
		value: "all",
		label: msg({ message: "All" }),
	},
	{
		value: "workspace",
		label: msg({
			message: "Workspaces",
		}),
	},
	{
		value: "project",
		label: msg({
			message: "Repos",
		}),
	},
	{
		value: "other",
		label: msg({
			message: "Other",
		}),
	},
];

/**
 * A row in the Projects pivot: a real Superset project, or one of two
 * catch-alls — "Sessions" (project-less session workspaces, e.g. automation
 * runs) and "No project" (cwds matching nothing in host.db, mostly deleted
 * workspaces' worktrees).
 */
type GroupKey =
	| { kind: "project"; name: string }
	| { kind: "sessions" }
	| { kind: "unattributed" };

function groupKeyFor(row: ProjectRow): GroupKey {
	if (row.group) return { kind: "project", name: row.group };
	if (row.kind === "workspace") return { kind: "sessions" };
	return { kind: "unattributed" };
}

function matchesGroup(row: ProjectRow, filter: GroupKey): boolean {
	const key = groupKeyFor(row);
	if (filter.kind === "project") {
		return key.kind === "project" && key.name === filter.name;
	}
	return key.kind === filter.kind;
}

function groupLabel(key: GroupKey): string {
	if (key.kind === "project") return key.name;
	return key.kind === "sessions"
		? i18n._(
				msg({
					message: "Sessions",
				}),
			)
		: i18n._(
				msg({
					message: "No project",
				}),
			);
}

interface ProjectGroup {
	key: GroupKey;
	name: string;
	usd: number;
	tokens: number;
	workspaceCount: number;
}

/**
 * Every attributed workspace/repo in the range — searchable, filterable,
 * and pivotable to a per-project rollup. Clicking a project narrows the
 * workspace list to that project.
 */
export function UsageWorkspacesPage({ hostUrl }: { hostUrl: string | null }) {
	const { t } = useLingui();
	const [days, setDays] = useState<number>(30);
	const [metric, setMetric] = useState<HistoryMetric>("usd");
	const [view, setView] = useState<ViewMode>("workspaces");
	const [kind, setKind] = useState<KindFilter>("all");
	const [groupFilter, setGroupFilter] = useState<GroupKey | null>(null);
	const [query, setQuery] = useState("");
	const historyQuery = useHostUsageHistory(hostUrl, days);
	const history = historyQuery.data ?? null;

	const needle = query.trim().toLowerCase();

	const workspaceRows = useMemo(() => {
		if (!history) return [];
		return history.projects
			.filter((row) => kind === "all" || row.kind === kind)
			.filter((row) => !groupFilter || matchesGroup(row, groupFilter))
			.filter((row) => !needle || row.project.toLowerCase().includes(needle))
			.sort((a, b) => b[metric] - a[metric]);
	}, [history, kind, groupFilter, needle, metric]);

	const projectGroups = useMemo(() => {
		if (!history) return [];
		const groups = new Map<string, ProjectGroup>();
		for (const row of history.projects) {
			const key = groupKeyFor(row);
			const name = groupLabel(key);
			let group = groups.get(name);
			if (!group) {
				group = { key, name, usd: 0, tokens: 0, workspaceCount: 0 };
				groups.set(name, group);
			}
			group.usd += row.usd;
			group.tokens += row.tokens;
			group.workspaceCount += 1;
		}
		// Real projects sorted by the metric; the two catch-alls pinned below
		// so 300 deleted worktrees don't drown 3 real projects.
		return [...groups.values()]
			.filter((group) => !needle || group.name.toLowerCase().includes(needle))
			.sort((a, b) => {
				const aSynthetic = a.key.kind !== "project" ? 1 : 0;
				const bSynthetic = b.key.kind !== "project" ? 1 : 0;
				if (aSynthetic !== bSynthetic) return aSynthetic - bSynthetic;
				return b[metric] - a[metric];
			});
	}, [history, needle, metric]);

	const shownRows: Array<{ usd: number; tokens: number }> =
		view === "workspaces" ? workspaceRows : projectGroups;
	const shownUsd = shownRows.reduce((sum, row) => sum + row.usd, 0);
	const shownTokens = shownRows.reduce((sum, row) => sum + row.tokens, 0);
	const shownCount = shownRows.length;
	const workspaceMax = workspaceRows[0] ? workspaceRows[0][metric] : 0;
	const projectMax = projectGroups[0] ? projectGroups[0][metric] : 0;

	return (
		<div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-3 px-6 py-4">
			<div className="flex flex-wrap items-center gap-2">
				<Link
					to="/settings/usage"
					className="flex items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					<LuArrowLeft className="size-3" />
					<Trans>Usage</Trans>
				</Link>
				<span className="text-muted-foreground/60">/</span>
				<h1 className="text-base font-semibold tracking-tight">
					{view === "projects" ? (
						<Trans>Projects</Trans>
					) : (
						<Trans>Workspaces</Trans>
					)}
				</h1>
				<div className="ml-auto flex items-center gap-1.5">
					<Tabs
						value={metric}
						onValueChange={(value) => setMetric(value as HistoryMetric)}
					>
						<TabsList className="h-6">
							<TabsTrigger value="usd" className="h-4 px-1.5 text-[10px]">
								<Trans>Cost</Trans>
							</TabsTrigger>
							<TabsTrigger value="tokens" className="h-4 px-1.5 text-[10px]">
								<Trans>Tokens</Trans>
							</TabsTrigger>
						</TabsList>
					</Tabs>
					<Tabs
						value={String(days)}
						onValueChange={(value) => setDays(Number(value))}
					>
						<TabsList className="h-6">
							{RANGE_OPTIONS.map((option) => (
								<TabsTrigger
									key={option}
									value={String(option)}
									className="h-4 px-1.5 text-[10px]"
								>
									{option}d
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<Tabs
					value={view}
					onValueChange={(value) => {
						setView(value as ViewMode);
						if (value === "projects") setGroupFilter(null);
					}}
				>
					<TabsList className="h-6">
						<TabsTrigger value="workspaces" className="h-4 px-1.5 text-[10px]">
							<Trans>Workspaces</Trans>
						</TabsTrigger>
						<TabsTrigger value="projects" className="h-4 px-1.5 text-[10px]">
							<Trans>Projects</Trans>
						</TabsTrigger>
					</TabsList>
				</Tabs>
				<Input
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder={
						view === "projects"
							? t({
									message: "Filter projects…",
								})
							: t({
									message: "Filter workspaces…",
								})
					}
					className="h-6 w-56 px-2 text-[11px]"
				/>
				{view === "workspaces" && (
					<Tabs
						value={kind}
						onValueChange={(value) => setKind(value as KindFilter)}
					>
						<TabsList className="h-6">
							{KIND_FILTERS.map((option) => (
								<TabsTrigger
									key={option.value}
									value={option.value}
									className="h-4 px-1.5 text-[10px]"
								>
									{i18n._(option.label)}
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>
				)}
				{groupFilter && view === "workspaces" && (
					<button
						type="button"
						onClick={() => setGroupFilter(null)}
						className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
					>
						{groupFilter.kind === "project" ? (
							<Trans>Project: {groupFilter.name}</Trans>
						) : (
							groupLabel(groupFilter)
						)}
						<LuX className="size-2.5" />
					</button>
				)}
				<span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
					<Trans>
						{shownCount} shown · {formatUsd(shownUsd)} ·{" "}
						{formatTokens(shownTokens)} tokens
					</Trans>
				</span>
			</div>

			{!history ? (
				<div className="py-8 text-center text-xs text-muted-foreground">
					<Trans>Loading usage history…</Trans>
				</div>
			) : shownCount === 0 ? (
				<div className="py-8 text-center text-xs text-muted-foreground">
					{view === "projects" ? (
						<Trans>No projects match.</Trans>
					) : (
						<Trans>No workspaces match.</Trans>
					)}
				</div>
			) : view === "projects" ? (
				<div className="flex flex-col gap-1.5">
					<div className="flex items-baseline justify-between border-b py-1 text-[11px] text-muted-foreground">
						<span className="font-medium">
							<Trans>Project</Trans>
						</span>
						<span className="font-medium">
							{metric === "usd" ? <Trans>Cost</Trans> : <Trans>Tokens</Trans>}
						</span>
					</div>
					{projectGroups.map((group) => (
						<button
							key={group.name}
							type="button"
							onClick={() => {
								setGroupFilter(group.key);
								setKind("all");
								setQuery("");
								setView("workspaces");
							}}
							className="flex flex-col gap-0.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-muted/60"
						>
							<div className="flex items-baseline justify-between gap-3 text-[11px]">
								<span
									className={`flex min-w-0 items-baseline gap-1.5 truncate ${group.key.kind !== "project" ? "text-muted-foreground" : ""}`}
								>
									{group.name}
									{group.workspaceCount > 1 && (
										<span className="text-[9px] text-muted-foreground">
											<Plural
												value={group.workspaceCount}
												one="# workspace"
												other="# workspaces"
											/>
										</span>
									)}
								</span>
								<span className="flex shrink-0 items-baseline gap-2 tabular-nums">
									<span className="text-muted-foreground">
										{formatTokens(group.tokens)}
									</span>
									<span>{formatUsd(group.usd)}</span>
								</span>
							</div>
							<div className="h-0.5 w-full overflow-hidden rounded-full bg-muted">
								<div
									className="h-full rounded-full bg-primary/60"
									style={{
										width: `${projectMax > 0 ? Math.max(1, (100 * (metric === "usd" ? group.usd : group.tokens)) / projectMax) : 0}%`,
									}}
								/>
							</div>
						</button>
					))}
				</div>
			) : (
				<div className="flex flex-col gap-1.5">
					<div className="flex items-baseline justify-between border-b py-1 text-[11px] text-muted-foreground">
						<span className="font-medium">
							<Trans>Workspace</Trans>
						</span>
						<span className="font-medium">
							{metric === "usd" ? <Trans>Cost</Trans> : <Trans>Tokens</Trans>}
						</span>
					</div>
					{workspaceRows.map((row) => (
						<WorkspaceUsageRow
							key={row.project}
							row={row}
							maxValue={workspaceMax}
							metric={metric}
							drillable={row.project in history.projectDetails}
						/>
					))}
				</div>
			)}
		</div>
	);
}

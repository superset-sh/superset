"use client";

import { Laptop } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { trpcClient } from "../../trpc/client";

interface WorkspaceRow {
	id: string;
	name: string;
	branch: string;
	projectId: string;
	projectName: string;
	hostId: string;
	type: "main" | "worktree";
	createdAt: Date;
}

type SortBy = "recent" | "oldest" | "name";
type CreatedWithin = "all" | "7d" | "30d" | "90d";

const CREATED_WITHIN_DAYS: Record<Exclude<CreatedWithin, "all">, number> = {
	"7d": 7,
	"30d": 30,
	"90d": 90,
};

function formatRelative(date: Date): string {
	const diffMs = Date.now() - date.getTime();
	const minutes = Math.floor(diffMs / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d ago`;
	const months = Math.floor(days / 30);
	if (months < 12) return `${months}mo ago`;
	const years = Math.floor(months / 12);
	return `${years}y ago`;
}

interface ProjectRow {
	id: string;
	name: string;
}

interface HostRow {
	machineId: string;
	name: string | null;
}

function hostLabel(host: HostRow): string {
	return host.name?.trim() || `Device ${host.machineId.slice(0, 8)}`;
}

export default function WorkspacesPage() {
	const [organizationId, setOrganizationId] = useState<string | null>(null);
	const [organizationName, setOrganizationName] = useState<string | null>(null);
	const [workspaces, setWorkspaces] = useState<WorkspaceRow[] | null>(null);
	const [projects, setProjects] = useState<ProjectRow[]>([]);
	const [hosts, setHosts] = useState<HostRow[]>([]);
	const [error, setError] = useState<string | null>(null);

	const [name, setName] = useState("");
	const [branch, setBranch] = useState("");
	const [projectId, setProjectId] = useState("");
	const [hostId, setHostId] = useState("");
	const [creating, setCreating] = useState(false);

	const [search, setSearch] = useState("");
	const [projectFilter, setProjectFilter] = useState("");
	const [hostFilter, setHostFilter] = useState("");
	const [sortBy, setSortBy] = useState<SortBy>("recent");
	const [createdWithin, setCreatedWithin] = useState<CreatedWithin>("all");

	const loadWorkspaces = useCallback(async (organization: string) => {
		const rows = await trpcClient.v2Workspace.list.query({
			organizationId: organization,
		});
		setWorkspaces(
			rows.map((row) => ({
				id: row.id,
				name: row.name,
				branch: row.branch,
				projectId: row.projectId,
				projectName: row.projectName,
				hostId: row.hostId,
				type: row.type,
				createdAt: new Date(row.createdAt),
			})),
		);
	}, []);

	useEffect(() => {
		(async () => {
			try {
				const organization = await trpcClient.organization.getActive.query();
				if (!organization) {
					setError("No active organization.");
					setWorkspaces([]);
					return;
				}
				setOrganizationId(organization.id);
				setOrganizationName(organization.name);
				const [, projectRows, hostRows] = await Promise.all([
					loadWorkspaces(organization.id),
					trpcClient.v2Project.list.query({
						organizationId: organization.id,
					}),
					trpcClient.v2Host.list.query(),
				]);
				setProjects(
					projectRows.map((project) => ({
						id: project.id,
						name: project.name,
					})),
				);
				setHosts(
					hostRows.map((host) => ({
						machineId: host.machineId,
						name: host.name,
					})),
				);
			} catch (caught) {
				setError(caught instanceof Error ? caught.message : String(caught));
				setWorkspaces([]);
			}
		})();
	}, [loadWorkspaces]);

	const visibleWorkspaces = useMemo(() => {
		const query = search.trim().toLowerCase();
		const cutoff =
			createdWithin === "all"
				? null
				: Date.now() - CREATED_WITHIN_DAYS[createdWithin] * 24 * 60 * 60 * 1000;
		const filtered = (workspaces ?? []).filter((workspace) => {
			if (projectFilter && workspace.projectId !== projectFilter) {
				return false;
			}
			if (hostFilter && workspace.hostId !== hostFilter) {
				return false;
			}
			if (cutoff !== null && workspace.createdAt.getTime() < cutoff) {
				return false;
			}
			if (!query) return true;
			return (
				workspace.name.toLowerCase().includes(query) ||
				workspace.branch.toLowerCase().includes(query) ||
				workspace.projectName.toLowerCase().includes(query)
			);
		});
		return filtered.sort((a, b) => {
			if (sortBy === "recent") {
				return b.createdAt.getTime() - a.createdAt.getTime();
			}
			if (sortBy === "oldest") {
				return a.createdAt.getTime() - b.createdAt.getTime();
			}
			return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
		});
	}, [workspaces, search, projectFilter, hostFilter, sortBy, createdWithin]);

	const canCreate =
		!!organizationId &&
		!!projectId &&
		!!hostId &&
		name.trim().length > 0 &&
		branch.trim().length > 0 &&
		!creating;

	const createWorkspace = useCallback(async () => {
		if (!organizationId) return;
		setCreating(true);
		setError(null);
		try {
			await trpcClient.v2Workspace.create.mutate({
				organizationId,
				projectId,
				name: name.trim(),
				branch: branch.trim(),
				hostId,
			});
			setName("");
			setBranch("");
			await loadWorkspaces(organizationId);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : String(caught));
		} finally {
			setCreating(false);
		}
	}, [organizationId, projectId, name, branch, hostId, loadWorkspaces]);

	return (
		<div className="mx-auto min-h-[100dvh] max-w-3xl px-5 py-8">
			<h1 className="text-xl font-medium">Workspaces</h1>
			{organizationName && (
				<p className="text-muted-foreground mt-1 text-sm">{organizationName}</p>
			)}

			{error && (
				<p className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
					{error}
				</p>
			)}

			<section className="mt-6 rounded-lg border p-4">
				<h2 className="text-sm font-medium">New workspace</h2>
				<div className="mt-3 grid gap-2 sm:grid-cols-2">
					<input
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder="Name"
						className="rounded-md border bg-transparent px-3 py-2 text-sm"
					/>
					<input
						value={branch}
						onChange={(event) => setBranch(event.target.value)}
						placeholder="Branch"
						className="rounded-md border bg-transparent px-3 py-2 text-sm"
					/>
					<select
						value={projectId}
						onChange={(event) => setProjectId(event.target.value)}
						className="rounded-md border bg-transparent px-3 py-2 text-sm"
					>
						<option value="">Select project…</option>
						{projects.map((project) => (
							<option key={project.id} value={project.id}>
								{project.name}
							</option>
						))}
					</select>
					<select
						value={hostId}
						onChange={(event) => setHostId(event.target.value)}
						className="rounded-md border bg-transparent px-3 py-2 text-sm"
					>
						<option value="">Select device…</option>
						{hosts.map((host) => (
							<option key={host.machineId} value={host.machineId}>
								{hostLabel(host)}
							</option>
						))}
					</select>
				</div>
				{hosts.length === 0 && (
					<p className="text-muted-foreground mt-2 text-xs">
						No devices available — register a machine in the desktop app first.
					</p>
				)}
				<button
					type="button"
					onClick={() => void createWorkspace()}
					disabled={!canCreate}
					className="bg-primary text-primary-foreground mt-3 rounded-md px-3 py-2 text-sm disabled:opacity-50"
				>
					{creating ? "Creating…" : "Create workspace"}
				</button>
			</section>

			<section className="mt-6">
				<h2 className="text-sm font-medium">Your workspaces</h2>
				<div className="mt-3 flex flex-wrap items-center gap-2">
					<input
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder="Search workspaces…"
						className="min-w-48 flex-1 rounded-md border bg-transparent px-3 py-2 text-sm"
					/>
					<select
						value={projectFilter}
						onChange={(event) => setProjectFilter(event.target.value)}
						className="rounded-md border bg-transparent px-3 py-2 text-sm"
					>
						<option value="">All projects</option>
						{projects.map((project) => (
							<option key={project.id} value={project.id}>
								{project.name}
							</option>
						))}
					</select>
					<select
						value={hostFilter}
						onChange={(event) => setHostFilter(event.target.value)}
						className="rounded-md border bg-transparent px-3 py-2 text-sm"
					>
						<option value="">All devices</option>
						{hosts.map((host) => (
							<option key={host.machineId} value={host.machineId}>
								{hostLabel(host)}
							</option>
						))}
					</select>
					<select
						value={createdWithin}
						onChange={(event) =>
							setCreatedWithin(event.target.value as CreatedWithin)
						}
						className="rounded-md border bg-transparent px-3 py-2 text-sm"
					>
						<option value="all">Any time</option>
						<option value="7d">Last 7 days</option>
						<option value="30d">Last 30 days</option>
						<option value="90d">Last 90 days</option>
					</select>
					<select
						value={sortBy}
						onChange={(event) => setSortBy(event.target.value as SortBy)}
						className="rounded-md border bg-transparent px-3 py-2 text-sm"
					>
						<option value="recent">Recently created</option>
						<option value="oldest">Oldest first</option>
						<option value="name">Name (A–Z)</option>
					</select>
				</div>
				{workspaces === null ? (
					<p className="text-muted-foreground mt-3 text-sm">Loading…</p>
				) : visibleWorkspaces.length === 0 ? (
					<p className="text-muted-foreground mt-3 text-sm">
						{workspaces.length === 0
							? "No workspaces yet."
							: "No workspaces match your filters."}
					</p>
				) : (
					<ul className="mt-3 grid gap-2">
						{visibleWorkspaces.map((workspace) => (
							<li key={workspace.id}>
								<Link
									href={`/workspaces/${workspace.id}`}
									className="hover:bg-muted/50 block rounded-lg border px-4 py-3"
								>
									<div className="flex items-center gap-1.5 text-sm font-medium">
										{workspace.type === "main" && (
											<Laptop
												aria-label="Main workspace"
												className="text-muted-foreground size-3.5 shrink-0"
											/>
										)}
										<span>{workspace.name}</span>
									</div>
									<div className="text-muted-foreground mt-0.5 text-xs">
										{workspace.projectName} · {workspace.branch} · created{" "}
										{formatRelative(workspace.createdAt)}
									</div>
								</Link>
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}

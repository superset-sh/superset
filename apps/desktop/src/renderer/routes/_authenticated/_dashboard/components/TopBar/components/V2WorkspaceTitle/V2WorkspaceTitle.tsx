import { OverflowFadeText } from "@superset/ui/overflow-fade-text";
import { and, eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { ChevronRight, GitBranch, Monitor } from "lucide-react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

interface V2WorkspaceTitleProps {
	workspaceId: string;
}

export function V2WorkspaceTitle({ workspaceId }: V2WorkspaceTitleProps) {
	const collections = useCollections();
	const { machineId } = useLocalHostService();
	const { data: workspaces = [] } = useLiveQuery(
		(q) =>
			q
				.from({ workspaces: collections.v2Workspaces })
				.where(({ workspaces }) => eq(workspaces.id, workspaceId))
				.select(({ workspaces }) => ({
					name: workspaces.name,
					branch: workspaces.branch,
					hostId: workspaces.hostId,
					organizationId: workspaces.organizationId,
				})),
		[collections, workspaceId],
	);
	const workspace = workspaces[0] ?? null;
	const name = workspace?.name ?? null;
	const branch = workspace?.branch ?? null;
	const remoteHostId =
		workspace && machineId && workspace.hostId !== machineId
			? workspace.hostId
			: null;
	const { data: remoteHostRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ hosts: collections.v2Hosts })
				.where(({ hosts }) =>
					and(
						eq(hosts.organizationId, workspace?.organizationId ?? ""),
						eq(hosts.machineId, remoteHostId ?? ""),
					),
				)
				.select(({ hosts }) => ({
					name: hosts.name,
				})),
		[collections, workspace?.organizationId, remoteHostId],
	);
	const remoteHostName = remoteHostRows[0]?.name ?? null;

	if (!name && !branch) {
		return null;
	}

	return (
		<div className="flex min-w-0 max-w-full items-center gap-1.5 text-[13px] tracking-tight">
			{name && (
				<OverflowFadeText className="font-medium text-foreground" title={name}>
					{name}
				</OverflowFadeText>
			)}
			{name && branch && (
				<ChevronRight
					className="size-3 shrink-0 text-muted-foreground/40"
					strokeWidth={2}
					aria-hidden="true"
				/>
			)}
			{branch && (
				<span
					className="flex min-w-0 items-center gap-1 text-muted-foreground"
					title={branch}
				>
					<GitBranch
						className="size-3 shrink-0 opacity-70"
						strokeWidth={2}
						aria-hidden="true"
					/>
					<OverflowFadeText>{branch}</OverflowFadeText>
				</span>
			)}
			{remoteHostId && (
				<span
					className="flex max-w-36 shrink-0 items-center gap-1 rounded border border-border/60 bg-muted/50 px-1.5 py-0.5 text-[11px] text-muted-foreground"
					title={`Remote host: ${remoteHostName ?? remoteHostId}`}
				>
					<Monitor className="size-3 shrink-0" strokeWidth={1.8} />
					<span className="min-w-0 truncate">{remoteHostName ?? "Remote"}</span>
				</span>
			)}
		</div>
	);
}

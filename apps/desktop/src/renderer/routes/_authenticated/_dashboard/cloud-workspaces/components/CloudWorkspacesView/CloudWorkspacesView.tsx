import { formatRelativePeriod } from "@superset/i18n/format";
import {
	groupCloudWorkspaces,
	groupCloudWorkspacesByTime,
	sortCloudWorkspaces,
} from "@superset/shared/cloud-workspace-groups";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { useNow } from "renderer/hooks/useNow";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { ACTIVE_WITHIN_MS } from "renderer/routes/_authenticated/_dashboard/components/CloudWorkspacePresenceStack";
import { CloudWorkspacesList } from "renderer/routes/_authenticated/_dashboard/components/CloudWorkspacesList";
import { useCloudWorkspaceListItems } from "renderer/routes/_authenticated/_dashboard/hooks/useCloudWorkspaceListItems";
import { useUnarchiveCloudWorkspace } from "renderer/routes/_authenticated/_dashboard/hooks/useUnarchiveCloudWorkspace";
import { useListDisplayStore } from "renderer/routes/_authenticated/_dashboard/stores/listDisplayStore";
import { NO_PROJECT } from "../../constants";
import type { CloudWorkspacesSearch } from "../../types";
import { CloudWorkspacesHeader } from "../CloudWorkspacesHeader";

const NOW_TICK_MS = 30_000;

interface CloudWorkspacesViewProps {
	search: CloudWorkspacesSearch;
}

export function CloudWorkspacesView({ search }: CloudWorkspacesViewProps) {
	const {
		people: personIds = [],
		projects: projectIds = [],
		labels: labelIds = [],
		status = ["active"],
	} = search;
	const navigate = useNavigate();
	const unarchive = useUnarchiveCloudWorkspace();
	const display = useListDisplayStore((state) => state.cloudWorkspaces);
	const setDisplay = useListDisplayStore(
		(state) => state.setCloudWorkspacesDisplay,
	);
	const now = useNow(NOW_TICK_MS);
	const organizationId = useActiveOrganizationId();
	const { data: session } = authClient.useSession();
	const userId = session?.user?.id ?? null;
	const { workspaces: active = [] } = useCloudWorkspaces();
	const showArchived = status.includes("archived");
	const { data: archived = [] } = cloudTrpc.cloudWorkspace.list.useQuery(
		{ organizationId: organizationId ?? "", archived: true },
		{ enabled: showArchived && organizationId !== null },
	);
	const showActive = status.includes("active");
	const workspaces = useMemo(
		() => [...(showActive ? active : []), ...(showArchived ? archived : [])],
		[showActive, showArchived, active, archived],
	);
	const [query, setQuery] = useState("");
	const listItems = useCloudWorkspaceListItems(workspaces);

	const people = [
		...new Map(
			workspaces
				.flatMap((workspace) => [
					workspace.createdBy,
					...workspace.presence.map(
						({ lastSeenAt: _seen, ...person }) => person,
					),
				])
				.filter((person) => person !== null)
				.map((person) => [person.userId, person] as const),
		).values(),
	].sort((left, right) => {
		if (left.userId === userId) return -1;
		if (right.userId === userId) return 1;
		return left.name.localeCompare(right.name);
	});

	const { data: labelOptions } = cloudTrpc.taskLabel.list.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: organizationId !== null },
	);
	const { data: workspaceLabels } = cloudTrpc.cloudWorkspace.labels.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: organizationId !== null },
	);
	const labelsById = useMemo(() => {
		const byId = new Map<string, Set<string>>();
		for (const row of workspaceLabels ?? []) {
			const set = byId.get(row.cloudWorkspaceId) ?? new Set<string>();
			set.add(row.labelId);
			byId.set(row.cloudWorkspaceId, set);
		}
		return byId;
	}, [workspaceLabels]);
	const { data: projects } = cloudTrpc.taskProject.list.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: organizationId !== null },
	);

	const setSearch = (patch: Partial<CloudWorkspacesSearch>) => {
		const next = { ...search, ...patch };
		navigate({
			to: "/cloud-workspaces",
			search: {
				...(next.people?.length ? { people: next.people } : {}),
				...(next.projects?.length ? { projects: next.projects } : {}),
				...(next.labels?.length ? { labels: next.labels } : {}),
				...(next.status && next.status.join() !== "active"
					? { status: next.status }
					: {}),
			},
		});
	};

	const scoped = workspaces.filter((workspace) => {
		if (
			projectIds.length > 0 &&
			!projectIds.includes(workspace.projectId ?? NO_PROJECT)
		) {
			return false;
		}
		if (
			labelIds.length > 0 &&
			!labelIds.some((labelId) => labelsById.get(workspace.id)?.has(labelId))
		) {
			return false;
		}
		if (
			personIds.length > 0 &&
			!personIds.includes(workspace.createdBy?.userId ?? "") &&
			!workspace.presence.some((person) => personIds.includes(person.userId))
		) {
			return false;
		}
		return true;
	});
	const needle = query.trim().toLowerCase();

	const matching = scoped.filter((workspace) =>
		workspace.name.toLowerCase().includes(needle),
	);
	const content =
		display.groupBy === "person"
			? {
					groups: groupCloudWorkspaces({
						workspaces: matching,
						userId,
						now,
						activeWithinMs: ACTIVE_WITHIN_MS,
						sort: display.sort,
					}).map(({ person, workspaces: grouped }) => ({
						key: person?.userId ?? "",
						label: person?.name ?? "—",
						person,
						items: grouped.map(listItems.toItem),
					})),
				}
			: display.groupBy === "time"
				? {
						groups: groupCloudWorkspacesByTime({
							workspaces: matching,
							now,
							sort: display.sort,
						}).map(({ period, workspaces: grouped }) => ({
							key: `${period.unit}:${period.count}`,
							label: formatRelativePeriod(period),
							items: grouped.map(listItems.toItem),
						})),
					}
				: {
						items: sortCloudWorkspaces(matching, display.sort).map(
							listItems.toItem,
						),
					};

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<CloudWorkspacesHeader
				people={people}
				personIds={personIds}
				projects={projects ?? []}
				projectIds={projectIds}
				labels={labelOptions ?? []}
				labelIds={labelIds}
				onLabelsChange={(labels) => setSearch({ labels })}
				query={query}
				sort={display.sort}
				groupBy={display.groupBy}
				status={status}
				onStatusChange={(next) => setSearch({ status: next })}
				onPeopleChange={(people) => setSearch({ people })}
				onProjectsChange={(projects) => setSearch({ projects })}
				onClearFilters={() =>
					setSearch({
						projects: undefined,
						labels: undefined,
						people: undefined,
						status: undefined,
					})
				}
				onSortChange={(sort) => setDisplay({ sort })}
				onGroupByChange={(groupBy) => setDisplay({ groupBy })}
				onQueryChange={setQuery}
			/>
			<div className="min-h-0 flex-1 overflow-y-auto px-2">
				<CloudWorkspacesList
					content={content}
					now={now}
					onOpen={(workspaceId) =>
						navigate({
							to: "/cloud-workspaces/$workspaceId",
							params: { workspaceId },
						})
					}
					onOpenPullRequest={listItems.onOpenPullRequest}
					onOpenRepo={listItems.onOpenRepo}
					onSetInSidebar={listItems.onSetInSidebar}
					onUnarchive={unarchive}
				/>
			</div>
		</div>
	);
}

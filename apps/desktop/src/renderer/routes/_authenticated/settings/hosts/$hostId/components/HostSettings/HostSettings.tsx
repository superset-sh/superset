import { toast } from "@superset/ui/sonner";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { authClient } from "renderer/lib/auth-client";
import {
	type PersistableTransaction,
	useOptimisticCollectionActions,
} from "renderer/routes/_authenticated/hooks/useOptimisticCollectionActions";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { CandidateRow } from "./components/AddMemberDropdown";
import { AddMemberDropdown } from "./components/AddMemberDropdown";
import { HostHeader } from "./components/HostHeader";
import type { MemberRowData } from "./components/MembersTable";
import { MembersTable } from "./components/MembersTable";

function notifyOnPersist(
	tx: PersistableTransaction | null,
	successMessage: string,
) {
	tx?.isPersisted.promise.then(
		() => toast.success(successMessage),
		() => {},
	);
}

interface HostSettingsProps {
	hostId: string;
}

export function HostSettings({ hostId }: HostSettingsProps) {
	const collections = useCollections();
	const { data: session } = authClient.useSession();
	const currentUserId = session?.user?.id ?? null;
	const actions = useOptimisticCollectionActions();

	const { data: hostRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ hosts: collections.v2Hosts })
				.where(({ hosts }) => eq(hosts.machineId, hostId))
				.select(({ hosts }) => ({ ...hosts })),
		[collections, hostId],
	);
	const host = hostRows[0];

	const { data: hostUserRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ uh: collections.v2UsersHosts })
				.where(({ uh }) => eq(uh.hostId, hostId))
				.select(({ uh }) => ({ ...uh })),
		[collections, hostId],
	);

	const { data: orgUsers = [] } = useLiveQuery(
		(q) =>
			q.from({ users: collections.users }).select(({ users }) => ({
				id: users.id,
				name: users.name,
				email: users.email,
			})),
		[collections],
	);

	const { data: orgMembers = [] } = useLiveQuery(
		(q) =>
			q
				.from({ m: collections.members })
				.where(({ m }) => eq(m.organizationId, host?.organizationId ?? ""))
				.select(({ m }) => ({ userId: m.userId })),
		[collections, host?.organizationId],
	);

	const userMap = useMemo(() => {
		const map = new Map<string, { name: string; email: string }>();
		for (const u of orgUsers) {
			map.set(u.id, { name: u.name, email: u.email });
		}
		return map;
	}, [orgUsers]);

	const members: MemberRowData[] = useMemo(() => {
		return hostUserRows
			.map((row) => {
				const u = userMap.get(row.userId);
				return {
					usersHostsId: `${row.userId}:${row.hostId}`,
					userId: row.userId,
					role: row.role as "owner" | "member",
					name: u?.name ?? "Unknown user",
					email: u?.email ?? "",
				};
			})
			.sort((a, b) => {
				if (a.role !== b.role) return a.role === "owner" ? -1 : 1;
				return a.name.localeCompare(b.name);
			});
	}, [hostUserRows, userMap]);

	const candidates: CandidateRow[] = useMemo(() => {
		const onHost = new Set(hostUserRows.map((r) => r.userId));
		return orgMembers
			.filter((m) => !onHost.has(m.userId))
			.map((m) => {
				const u = userMap.get(m.userId);
				return {
					userId: m.userId,
					name: u?.name ?? "Unknown user",
					email: u?.email ?? "",
				};
			})
			.sort((a, b) => a.name.localeCompare(b.name));
	}, [orgMembers, hostUserRows, userMap]);

	const isOwner = useMemo(() => {
		if (!currentUserId) return false;
		return (
			hostUserRows.find((r) => r.userId === currentUserId)?.role === "owner"
		);
	}, [hostUserRows, currentUserId]);

	if (!host) {
		return (
			<div className="p-6 text-sm text-muted-foreground">
				Host not found in this organization.
			</div>
		);
	}

	const handleAdd = (candidate: CandidateRow) => {
		notifyOnPersist(
			actions.v2UsersHosts.addMember({
				hostId,
				userId: candidate.userId,
				organizationId: host.organizationId,
			}),
			"Member added",
		);
	};

	const handleRemove = (member: MemberRowData) => {
		notifyOnPersist(
			actions.v2UsersHosts.removeMember(member.usersHostsId),
			"Member removed",
		);
	};

	const handleSetRole = (member: MemberRowData, role: "owner" | "member") => {
		notifyOnPersist(
			actions.v2UsersHosts.setMemberRole(member.usersHostsId, role),
			"Role updated",
		);
	};

	return (
		<div className="p-6 max-w-4xl w-full select-text">
			<HostHeader
				name={host.name}
				isOnline={host.isOnline}
				machineId={host.machineId}
			/>

			<section className="space-y-3">
				<div className="flex items-end justify-between">
					<div>
						<h3 className="text-base font-medium">Members</h3>
						<p className="text-sm text-muted-foreground">
							People in your organization who can use this host.
						</p>
					</div>
					{isOwner && (
						<AddMemberDropdown candidates={candidates} onPick={handleAdd} />
					)}
				</div>

				<MembersTable
					members={members}
					isOwner={isOwner}
					onSetRole={handleSetRole}
					onRemove={handleRemove}
				/>

				{!isOwner && (
					<p className="text-xs text-muted-foreground">
						Only owners of this host can change membership.
					</p>
				)}
			</section>
		</div>
	);
}

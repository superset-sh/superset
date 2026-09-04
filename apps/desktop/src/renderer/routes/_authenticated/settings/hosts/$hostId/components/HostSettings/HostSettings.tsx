import { Trans, useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { useMemo } from "react";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useHostsPresence } from "renderer/hooks/useHostsPresence";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import {
	type PersistableTransaction,
	useOptimisticActions,
} from "renderer/routes/_authenticated/hooks/useOptimisticActions";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { ExposeViaRelaySection } from "renderer/routes/_authenticated/settings/components/ExposeViaRelaySection";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import type { CandidateRow } from "./components/AddMemberDropdown";
import { AddMemberDropdown } from "./components/AddMemberDropdown";
import { DeleteHostSection } from "./components/DeleteHostSection";
import { HostHeader } from "./components/HostHeader";
import type { MemberRowData } from "./components/MembersTable";
import { MembersTable } from "./components/MembersTable";
import { WorktreeLocationSection } from "./components/WorktreeLocationSection";

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
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const { data: session } = authClient.useSession();
	const currentUserId = session?.user?.id ?? null;
	const actions = useOptimisticActions();
	const { machineId } = useLocalHostService();
	const hostUrl = useHostUrl(hostId);

	const { data: hosts = [], isPending: hostsPending } =
		cloudTrpc.v2Host.list.useQuery(undefined);
	const host = useMemo(
		() => hosts.find((row) => row.machineId === hostId),
		[hosts, hostId],
	);
	const presence = useHostsPresence(hosts);
	const hostIsOnline = host
		? (presence?.get(host.machineId) ?? host.isOnline)
		: false;

	const { data: allHostMembers = [] } =
		cloudTrpc.v2Host.listMembers.useQuery(undefined);
	const hostUserRows = useMemo(
		() => allHostMembers.filter((row) => row.hostId === hostId),
		[allHostMembers, hostId],
	);

	const { data: orgMembers = [] } =
		cloudTrpc.organization.listMembers.useQuery(undefined);

	const userMap = useMemo(() => {
		const map = new Map<string, { name: string; email: string }>();
		for (const member of orgMembers) {
			map.set(member.user.id, {
				name: member.user.name,
				email: member.user.email,
			});
		}
		return map;
	}, [orgMembers]);

	const members: MemberRowData[] = useMemo(() => {
		return hostUserRows
			.map((row) => {
				const u = userMap.get(row.userId);
				return {
					usersHostsId: `${row.userId}:${row.hostId}`,
					userId: row.userId,
					role: row.role as "owner" | "member",
					name:
						u?.name ??
						t({
							message: "Unknown user",
						}),
					email: u?.email ?? "",
				};
			})
			.sort((a, b) => {
				if (a.role !== b.role) return a.role === "owner" ? -1 : 1;
				return a.name.localeCompare(b.name);
			});
	}, [hostUserRows, userMap, t]);

	const candidates: CandidateRow[] = useMemo(() => {
		const onHost = new Set(hostUserRows.map((r) => r.userId));
		return orgMembers
			.filter((m) => !onHost.has(m.userId))
			.map((m) => {
				const u = userMap.get(m.userId);
				return {
					userId: m.userId,
					name:
						u?.name ??
						t({
							message: "Unknown user",
						}),
					email: u?.email ?? "",
				};
			})
			.sort((a, b) => a.name.localeCompare(b.name));
	}, [orgMembers, hostUserRows, userMap, t]);

	const isOwner = useMemo(() => {
		if (!currentUserId) return false;
		return (
			hostUserRows.find((r) => r.userId === currentUserId)?.role === "owner"
		);
	}, [hostUserRows, currentUserId]);
	const isRemoteTarget = Boolean(machineId && hostId !== machineId);

	if (!host) {
		if (hostsPending) return null;
		return (
			<div className="p-6 text-sm text-muted-foreground select-text cursor-text">
				<Trans>Host not found in this organization.</Trans>
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
			t({ message: "Member added" }),
		);
	};

	const handleRemove = (member: MemberRowData) => {
		notifyOnPersist(
			actions.v2UsersHosts.removeMember(member.usersHostsId),
			t({ message: "Member removed" }),
		);
	};

	const handleSetRole = (member: MemberRowData, role: "owner" | "member") => {
		notifyOnPersist(
			actions.v2UsersHosts.setMemberRole(member.usersHostsId, role),
			t({ message: "Role updated" }),
		);
	};

	return (
		<div className="p-6 max-w-4xl w-full mx-auto select-text">
			<HostHeader
				name={host.name}
				isOnline={hostIsOnline}
				machineId={host.machineId}
				canRename={isOwner}
			/>

			<div className="space-y-10">
				<WorktreeLocationSection
					hostUrl={hostUrl}
					hostName={host.name}
					isRemoteTarget={isRemoteTarget}
					isOnline={hostIsOnline || !isRemoteTarget}
					canEdit={isOwner}
				/>

				{hostId === machineId && (
					<section className="space-y-3">
						<h3 className="text-sm font-medium">
							<HighlightText
								text={t({
									message: "Remote access",
								})}
								query={searchQuery}
							/>
						</h3>
						<ExposeViaRelaySection />
					</section>
				)}

				<section className="space-y-3">
					<div className="flex items-end justify-between gap-4">
						<div>
							<h3 className="text-sm font-medium">
								<HighlightText
									text={t({
										message: "Members",
									})}
									query={searchQuery}
								/>
							</h3>
							{!isOwner && (
								<p className="text-sm text-muted-foreground mt-0.5">
									<Trans>Only owners can change membership.</Trans>
								</p>
							)}
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
				</section>

				{isOwner ? (
					<DeleteHostSection
						hostId={hostId}
						hostName={host.name}
						isLocalHost={hostId === machineId}
					/>
				) : null}
			</div>
		</div>
	);
}

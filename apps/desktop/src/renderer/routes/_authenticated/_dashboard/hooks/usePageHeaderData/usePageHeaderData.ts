import { usePageCommentThreads } from "@superset/cloud-client";
import type {
	CommentThread,
	PageHeaderPage,
	PageHeaderSharing,
	PageHeaderVersion,
	PageVisibility,
} from "@superset/ui/page-comments";
import type { ShareGranteeRef } from "@superset/ui/share-access";
import { useCallback } from "react";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useShareDirectory } from "../useShareDirectory";

export interface PageHeaderTarget {
	slug: string;
	pageId?: string;
	title?: string;
	version?: number | null;
}

interface PageHeaderData {
	page: PageHeaderPage | null;
	versions: PageHeaderVersion[];
	threads: CommentThread[];
	currentUserId: string | undefined;
	onSetVisibility: (visibility: PageVisibility) => Promise<void>;
	onSetSharedVersion: (version: number | null) => Promise<void>;
	onRename: (title: string) => Promise<void>;
	onRefresh: () => void;
	onDelete: () => Promise<void>;
	sharing: PageHeaderSharing;
	/** False for readers who may only view. The server enforces it either way. */
	canComment: boolean;
}

export function usePageHeaderData(data: PageHeaderTarget): PageHeaderData {
	const { data: session } = authClient.useSession();
	const ref = data.pageId ? { id: data.pageId } : { slug: data.slug };

	const pull = cloudTrpc.page.pull.useQuery(ref);
	const pageId = data.pageId ?? pull.data?.id;
	const enabled = Boolean(pull.data);

	const versions = cloudTrpc.page.versions.useQuery(ref, { enabled });
	const access = cloudTrpc.page.access.useQuery(ref, { enabled });

	const version = data.version ?? pull.data?.version ?? 0;
	const { threads } = usePageCommentThreads({
		pageId: pageId ?? "",
		version,
	});

	const utils = cloudTrpc.useUtils();
	const setVisibility = cloudTrpc.page.setVisibility.useMutation();
	const setSharedVersion = cloudTrpc.page.setSharedVersion.useMutation();
	const updatePage = cloudTrpc.page.update.useMutation();
	const deletePage = cloudTrpc.page.delete.useMutation();

	const share = useShareDirectory();
	const sharingQuery = cloudTrpc.page.sharing.get.useQuery(
		{ id: pageId ?? "" },
		{ enabled: Boolean(pageId) },
	);
	const addShares = cloudTrpc.page.sharing.add.useMutation();
	const removeShare = cloudTrpc.page.sharing.remove.useMutation();
	const setShareRole = cloudTrpc.page.sharing.setRole.useMutation();
	const setOrgRole = cloudTrpc.page.setOrgRole.useMutation();
	const refreshSharing = () =>
		pageId ? utils.page.sharing.get.invalidate({ id: pageId }) : undefined;
	const grantees = sharingQuery.data?.grantees ?? [];
	const sharing: PageHeaderSharing = {
		grantees,
		orgRole: sharingQuery.data?.orgRole ?? "comment",
		directory: share.directory,
		organizationName: share.organizationName,
		inviteNew: share.inviteNew,
		onUpgrade: share.onUpgrade,
		onAdd: async ({ grantees: picked, emails, role }) => {
			if (!pageId) return;
			const invitationIds = await share.inviteEmails(emails);
			await addShares.mutateAsync({
				id: pageId,
				role: role === "view" ? "view" : "comment",
				grantees: [
					...picked,
					...invitationIds.map(
						(invitationId): ShareGranteeRef => ({
							kind: "invitation",
							invitationId,
						}),
					),
				],
			});
			await refreshSharing();
		},
		onRemove: async (grantee) => {
			if (!pageId) return;
			await removeShare.mutateAsync({ id: pageId, grantee });
			await refreshSharing();
		},
		onSetRole: async (grantee, role) => {
			if (!pageId) return;
			await setShareRole.mutateAsync({ id: pageId, grantee, role });
			await refreshSharing();
		},
		onSetOrgRole: async (role) => {
			if (!pageId) return;
			await setOrgRole.mutateAsync({ id: pageId, role });
			await Promise.all([refreshSharing(), access.refetch()]);
		},
		onResendInvite: async (invitationId) => {
			const invite = grantees.find(
				(g) => g.kind === "invitation" && g.invitationId === invitationId,
			);
			if (invite?.kind === "invitation") {
				await share.inviteEmails([invite.email]);
			}
		},
	};

	const refresh = useCallback(async () => {
		await Promise.all([pull.refetch(), versions.refetch()]);
	}, [pull, versions]);

	const resolved = pull.data;
	const page: PageHeaderPage | null =
		resolved && pageId
			? {
					id: pageId,
					title: resolved.title ?? data.title ?? data.slug,
					url: resolved.url,
					visibility: resolved.visibility,
					createdByUserId: resolved.createdByUserId,
					owner: access.data?.owner ?? null,
					updatedAt: resolved.updatedAt,
					sharedVersion: resolved.sharedVersion,
					latestVersion: resolved.latestVersion,
					servedVersion: resolved.servedVersion,
				}
			: null;

	return {
		page,
		versions: versions.data ?? [],
		threads,
		currentUserId: session?.user.id,
		onSetVisibility: async (visibility) => {
			if (!pageId) return;
			const updated = await setVisibility.mutateAsync({
				id: pageId,
				visibility,
			});
			utils.page.pull.setData(ref, (prev) =>
				prev ? { ...prev, visibility: updated.visibility } : prev,
			);
		},
		onSetSharedVersion: async (version) => {
			if (!pageId) return;
			await setSharedVersion.mutateAsync({ id: pageId, version });
			await refresh();
		},
		onRename: async (title) => {
			if (!pageId) return;
			const updated = await updatePage.mutateAsync({ id: pageId, title });
			utils.page.pull.setData(ref, (prev) =>
				prev ? { ...prev, title: updated.title } : prev,
			);
			await Promise.all([
				utils.page.pull.invalidate(),
				utils.page.listPaginated.invalidate(),
			]);
		},
		onRefresh: () => {
			void refresh();
		},
		onDelete: async () => {
			if (!pageId) return;
			await deletePage.mutateAsync({ id: pageId });
		},
		sharing,
		canComment: access.data?.canComment ?? true,
	};
}

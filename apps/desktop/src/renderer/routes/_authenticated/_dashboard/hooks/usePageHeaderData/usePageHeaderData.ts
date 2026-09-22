import { usePageCommentThreads } from "@superset/cloud-client";
import type {
	CommentThread,
	PageHeaderPage,
	PageHeaderVersion,
	PageVisibility,
} from "@superset/ui/page-comments";
import { useCallback } from "react";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

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
				utils.page.list.invalidate(),
			]);
		},
		onRefresh: () => {
			void refresh();
		},
		onDelete: async () => {
			if (!pageId) return;
			await deletePage.mutateAsync({ id: pageId });
		},
	};
}

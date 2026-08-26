import { authClient } from "@superset/auth/client";
import type {
	CommentThread,
	PageHeaderPage,
	PageHeaderVersion,
} from "@superset/ui/page-comments";
import { useCallback } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { toThreads } from "renderer/routes/_authenticated/_dashboard/utils/toThreads";

export interface PageHeaderTarget {
	slug: string;
	pageId?: string;
	title?: string;
}

interface PageHeaderData {
	page: PageHeaderPage | null;
	versions: PageHeaderVersion[];
	threads: CommentThread[];
	currentUserId: string | undefined;
	onSetVisibility: (visibility: "just_me" | "org") => Promise<void>;
	onSetSharedVersion: (version: number | null) => Promise<void>;
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

	const version = pull.data?.version ?? 0;
	const comments = cloudTrpc.pageComment.list.useQuery(
		{ pageId: pageId ?? "", version },
		{ enabled: Boolean(pageId) && version > 0 },
	);

	const setVisibility = cloudTrpc.page.setVisibility.useMutation();
	const setSharedVersion = cloudTrpc.page.setSharedVersion.useMutation();
	const deletePage = cloudTrpc.page.delete.useMutation();

	const threads = toThreads(comments.data ?? []);

	const refresh = useCallback(async () => {
		await Promise.all([pull.refetch(), versions.refetch()]);
	}, [pull, versions]);

	const resolved = pull.data;
	const page: PageHeaderPage | null =
		resolved && pageId
			? {
					id: pageId,
					title: data.title ?? resolved.title ?? data.slug,
					url: resolved.url,
					visibility: resolved.visibility === "just_me" ? "just_me" : "org",
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
			await setVisibility.mutateAsync({ id: pageId, visibility });
			await refresh();
		},
		onSetSharedVersion: async (version) => {
			if (!pageId) return;
			await setSharedVersion.mutateAsync({ id: pageId, version });
			await refresh();
		},
		onDelete: async () => {
			if (!pageId) return;
			await deletePage.mutateAsync({ id: pageId });
		},
	};
}

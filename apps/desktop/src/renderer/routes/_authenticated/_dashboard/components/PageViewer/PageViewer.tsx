import { useLingui } from "@lingui/react/macro";
import {
	CommentProvider,
	CommentsSidebar,
	PageCommentsView,
} from "@superset/ui/page-comments";
import { Spinner } from "@superset/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useRef } from "react";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { PageViewerMessage } from "./components/PageViewerMessage";
import { usePageCommentStore } from "./hooks/usePageCommentStore";

const scrollPositions = new Map<string, number>();

export interface ResolvedPage {
	id: string;
	slug: string;
	title: string | null;
}

interface PageViewerProps {
	slug: string;
	pageId?: string;
	title?: string;
	commentsEnabled: boolean;
	onCommentsEnabledChange: (enabled: boolean) => void;
	onResolved?: (page: ResolvedPage) => void;
}

export function PageViewer({
	slug,
	pageId,
	title,
	commentsEnabled,
	onCommentsEnabledChange,
	onResolved,
}: PageViewerProps) {
	const { t } = useLingui();
	const { data: session } = authClient.useSession();
	const pull = cloudTrpc.page.pull.useQuery(pageId ? { id: pageId } : { slug });
	const downloadUrl = pull.data?.downloadUrl;
	const resolvedPageId = pageId ?? pull.data?.id;
	const resolvedTitle = title ?? pull.data?.title ?? slug;
	const store = usePageCommentStore({
		pageId: resolvedPageId ?? "",
		version: pull.data?.version ?? 0,
	});
	const scrollKey = `${resolvedPageId ?? slug}:${pull.data?.version ?? 0}`;

	const onResolvedRef = useRef(onResolved);
	onResolvedRef.current = onResolved;
	const resolved = pull.data;
	useEffect(() => {
		if (!resolved) return;
		onResolvedRef.current?.({
			id: resolved.id,
			slug: resolved.slug,
			title: resolved.title ?? null,
		});
	}, [resolved]);

	const content = useQuery({
		queryKey: ["page-content", downloadUrl],
		enabled: Boolean(downloadUrl),
		queryFn: async () => {
			const response = await fetch(downloadUrl as string, {
				cache: "no-store",
			});
			if (!response.ok) {
				throw new Error(`Page content failed to load (${response.status})`);
			}
			return response.text();
		},
	});

	const servedToken = useRef<string | null>(null);
	const serveHtml = useCallback(async (injectedHtml: string) => {
		if (servedToken.current) {
			void electronTrpcClient.page.content.release.mutate({
				token: servedToken.current,
			});
		}
		const { token, url } =
			await electronTrpcClient.page.content.register.mutate({
				html: injectedHtml,
			});
		servedToken.current = token;
		return url;
	}, []);

	useEffect(
		() => () => {
			if (servedToken.current) {
				void electronTrpcClient.page.content.release.mutate({
					token: servedToken.current,
				});
				servedToken.current = null;
			}
		},
		[],
	);

	if (pull.error || content.error) {
		const missing =
			pull.error instanceof TRPCClientError &&
			pull.error.data?.code === "NOT_FOUND";
		return (
			<PageViewerMessage
				title={
					missing
						? t({
								id: "dashboard.pageViewer.pageMissingTitle",
								message: "This page no longer exists",
							})
						: t({
								id: "dashboard.pageViewer.pageOpenFailedTitle",
								message: "This page could not be opened",
							})
				}
				description={
					missing
						? t({
								id: "dashboard.pageViewer.pageMissingDescription",
								message:
									"It may have been deleted, or it belongs to another organization.",
							})
						: (pull.error?.message ?? content.error?.message)
				}
			/>
		);
	}

	if (!content.data) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<Spinner className="size-4" />
			</div>
		);
	}

	return (
		<CommentProvider
			store={store}
			enabled={commentsEnabled}
			onEnabledChange={onCommentsEnabledChange}
			user={{
				id: session?.user.id ?? "",
				name:
					session?.user.name ??
					t({ id: "dashboard.pageViewer.youFallback", message: "You" }),
				image: session?.user.image ?? null,
			}}
		>
			<div className="flex h-full w-full">
				<div className="min-h-0 min-w-0 flex-1">
					<PageCommentsView
						html={content.data}
						title={resolvedTitle}
						serveHtml={serveHtml}
						initialScrollY={scrollPositions.get(scrollKey) ?? 0}
						onScrollYChange={(y) => scrollPositions.set(scrollKey, y)}
					/>
				</div>
				{commentsEnabled ? (
					<CommentsSidebar servedVersion={pull.data?.version ?? null} />
				) : null}
			</div>
		</CommentProvider>
	);
}

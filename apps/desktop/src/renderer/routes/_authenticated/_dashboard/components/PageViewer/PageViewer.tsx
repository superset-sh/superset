import { authClient } from "@superset/auth/client";
import { CommentProvider, PageCommentsView } from "@superset/ui/page-comments";
import { Spinner } from "@superset/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useRef } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { PageViewerMessage } from "./components/PageViewerMessage";
import { usePageCommentStore } from "./hooks/usePageCommentStore";

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
	const { data: session } = authClient.useSession();
	const pull = cloudTrpc.page.pull.useQuery(pageId ? { id: pageId } : { slug });
	const downloadUrl = pull.data?.downloadUrl;
	const resolvedPageId = pageId ?? pull.data?.id;
	const resolvedTitle = title ?? pull.data?.title ?? slug;
	const store = usePageCommentStore({
		pageId: resolvedPageId ?? "",
		version: pull.data?.version ?? 0,
	});

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
			void electronTrpcClient.pageContent.release.mutate({
				token: servedToken.current,
			});
		}
		const { token, url } = await electronTrpcClient.pageContent.register.mutate(
			{ html: injectedHtml },
		);
		servedToken.current = token;
		return url;
	}, []);

	useEffect(
		() => () => {
			if (servedToken.current) {
				void electronTrpcClient.pageContent.release.mutate({
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
						? "This page no longer exists"
						: "This page could not be opened"
				}
				description={
					missing
						? "It may have been deleted, or it belongs to another organization."
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
				name: session?.user.name ?? "You",
				image: session?.user.image ?? null,
			}}
		>
			<div className="flex h-full w-full flex-col">
				<div className="min-h-0 min-w-0 flex-1">
					<PageCommentsView
						html={content.data}
						title={resolvedTitle}
						serveHtml={serveHtml}
					/>
				</div>
			</div>
		</CommentProvider>
	);
}

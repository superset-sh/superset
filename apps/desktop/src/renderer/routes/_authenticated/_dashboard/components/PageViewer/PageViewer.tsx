import { useLingui } from "@lingui/react/macro";
import {
	CommentProvider,
	CommentsSidebar,
	PageCommentsView,
} from "@superset/ui/page-comments";
import { Spinner } from "@superset/ui/spinner";
import { TRPCClientError } from "@trpc/client";
import { useEffect, useRef } from "react";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
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

	if (pull.error) {
		const missing =
			pull.error instanceof TRPCClientError &&
			pull.error.data?.code === "NOT_FOUND";
		return (
			<PageViewerMessage
				title={
					missing
						? t({
								message: "This page no longer exists",
							})
						: t({
								message: "This page could not be opened",
							})
				}
				description={
					missing
						? t({
								message:
									"It may have been deleted, or it belongs to another organization.",
							})
						: pull.error.message
				}
			/>
		);
	}

	if (!pull.data) {
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
				name: session?.user.name ?? t({ message: "You" }),
				image: session?.user.image ?? null,
			}}
		>
			<div className="flex h-full w-full">
				<div className="min-h-0 min-w-0 flex-1">
					<PageCommentsView
						src={pull.data.viewUrl}
						title={resolvedTitle}
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

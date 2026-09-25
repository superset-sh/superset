import { useLingui } from "@lingui/react/macro";
import { usePageComments } from "@superset/cloud-client";
import { errorMessage } from "@superset/i18n/errors";
import { pageCommentUser } from "@superset/shared/page-comments";
import type { PageLinkClick } from "@superset/shared/page-comments-runtime";
import {
	AllCommentsButton,
	CommentProvider,
	CommentsPanel,
	PageCommentsView,
	PageVersionBanner,
} from "@superset/ui/page-comments";
import { toast } from "@superset/ui/sonner";
import { Spinner } from "@superset/ui/spinner";
import { TRPCClientError } from "@trpc/client";
import { useEffect, useMemo, useRef } from "react";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { PageViewerMessage } from "./components/PageViewerMessage";

const scrollPositions = new Map<string, number>();

interface ResolvedPage {
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
	onFramePointerDown?: () => void;
	onLinkClick?: (click: PageLinkClick) => void;
	version?: number | null;
	onExitPreview?: () => void;
}

export function PageViewer({
	slug,
	pageId,
	title,
	commentsEnabled,
	onCommentsEnabledChange,
	onResolved,
	onFramePointerDown,
	onLinkClick = (click) => {
		void electronTrpcClient.external.openUrl
			.mutate(click.url)
			.catch(console.error);
	},
	version,
	onExitPreview,
}: PageViewerProps) {
	const { t } = useLingui();
	const { data: session } = authClient.useSession();
	const pull = cloudTrpc.page.pull.useQuery({
		...(pageId ? { id: pageId } : { slug }),
		...(version ? { version } : {}),
	});
	const resolvedPageId = pageId ?? pull.data?.id;
	const resolvedTitle = title ?? pull.data?.title ?? slug;
	const user = useMemo(
		() => pageCommentUser(session, t({ message: "You" })),
		[session, t],
	);
	const store = usePageComments({
		pageId: resolvedPageId ?? "",
		version: pull.data?.version ?? 0,
		user,
		onError: (error) => toast.error(errorMessage(error)),
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

	const previewing =
		pull.data.servedVersion !== null &&
		pull.data.version !== pull.data.servedVersion;

	return (
		<CommentProvider
			key={resolvedPageId}
			store={store}
			enabled={commentsEnabled && !previewing}
			onEnabledChange={onCommentsEnabledChange}
			user={user}
			pageOwnerId={pull.data?.createdByUserId}
		>
			<div className="flex h-full w-full flex-col">
				{previewing && onExitPreview ? (
					<PageVersionBanner
						version={pull.data.version}
						onExit={onExitPreview}
					/>
				) : null}
				<div className="relative flex min-h-0 w-full flex-1">
					<div className="min-h-0 min-w-0 flex-1">
						<PageCommentsView
							pinchZoomEnabled
							src={pull.data.viewUrl}
							title={resolvedTitle}
							initialScrollY={scrollPositions.get(scrollKey) ?? 0}
							onScrollYChange={(y) => scrollPositions.set(scrollKey, y)}
							onFramePointerDown={onFramePointerDown}
							onLinkClick={onLinkClick}
						/>
					</div>
					<AllCommentsButton />
					<CommentsPanel servedVersion={pull.data?.version ?? null} />
				</div>
			</div>
		</CommentProvider>
	);
}

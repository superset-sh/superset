import { authClient } from "@superset/auth/client";
import {
	CommentModeToggle,
	CommentProvider,
	PageCommentsView,
} from "@superset/ui/page-comments";
import { Spinner } from "@superset/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import { notFound } from "@tanstack/react-router";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useRef } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import type { PagePaneData } from "../../../../types";
import { PageHandoffMenu } from "./components/PageHandoffMenu";
import { PagePaneMessage } from "./components/PagePaneMessage";
import { PageVisibilityMenu } from "./components/PageVisibilityMenu";
import { usePageCommentStore } from "./hooks/usePageCommentStore";

interface PagePaneProps {
	data: PagePaneData;
}

export function PagePane({ data }: PagePaneProps) {
	const { workspace } = useWorkspace();
	const { data: session } = authClient.useSession();
	const pull = cloudTrpc.page.pull.useQuery({ id: data.pageId });
	const downloadUrl = pull.data?.downloadUrl;
	const store = usePageCommentStore({
		pageId: data.pageId,
		version: pull.data?.version ?? 0,
	});

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
		if (missing) throw notFound();
		return (
			<PagePaneMessage
				title="This page could not be opened"
				description={pull.error?.message ?? content.error?.message}
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
			user={{
				id: session?.user.id ?? "",
				name: session?.user.name ?? "You",
				image: session?.user.image ?? null,
			}}
		>
			<div className="flex h-full w-full flex-col">
				<div className="flex h-9 shrink-0 items-center justify-end gap-1 border-b px-2">
					{pull.data ? (
						<PageVisibilityMenu
							pageId={data.pageId}
							visibility={
								pull.data.visibility === "just_me" ? "just_me" : "org"
							}
							createdByUserId={pull.data.createdByUserId}
						/>
					) : null}
					<PageHandoffMenu
						workspaceId={workspace.id}
						pageTitle={data.title}
						pageSlug={data.slug}
					/>
					<CommentModeToggle />
				</div>
				<div className="min-h-0 min-w-0 flex-1">
					<PageCommentsView
						html={content.data}
						title={data.title}
						serveHtml={serveHtml}
					/>
				</div>
			</div>
		</CommentProvider>
	);
}

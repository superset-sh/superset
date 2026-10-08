"use client";

import {
	CommentModeToggle,
	PageHeader,
	type PageHeaderPage,
	type PageHeaderVersion,
} from "@superset/ui/page-comments";
import { useMutation } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/react";
import { OpenInSupersetButton } from "../OpenInSupersetButton";
import { PageWatchBadge } from "./components/PageWatchBadge";
import { usePageSharing } from "./hooks/usePageSharing";

interface PageHeaderBarProps {
	page: PageHeaderPage;
	versions: PageHeaderVersion[];
	currentUserId: string | undefined;
	slug: string;
	watching: boolean;
	watchAgentId: string | null;
	previewVersion: number | null;
	canComment: boolean;
}

export function PageHeaderBar({
	page,
	versions,
	currentUserId,
	slug,
	watching,
	watchAgentId,
	previewVersion,
	canComment,
}: PageHeaderBarProps) {
	const trpc = useTRPC();
	const router = useRouter();
	const pathname = usePathname();
	const setVisibility = useMutation(trpc.page.setVisibility.mutationOptions());
	const setSharedVersion = useMutation(
		trpc.page.setSharedVersion.mutationOptions(),
	);
	const updatePage = useMutation(trpc.page.update.mutationOptions());
	const deletePage = useMutation(trpc.page.delete.mutationOptions());
	const sharing = usePageSharing(page.id);

	return (
		<PageHeader
			page={page}
			versions={versions}
			currentUserId={currentUserId}
			previewVersion={previewVersion}
			trailing={
				<>
					<OpenInSupersetButton slug={slug} />
					<PageWatchBadge
						slug={slug}
						initialWatching={watching}
						initialAgentId={watchAgentId}
					/>
					{canComment ? <CommentModeToggle /> : null}
				</>
			}
			onSetVisibility={async (visibility) => {
				await setVisibility.mutateAsync({ id: page.id, visibility });
				router.refresh();
			}}
			onSetSharedVersion={async (version) => {
				await setSharedVersion.mutateAsync({ id: page.id, version });
				router.refresh();
			}}
			onRename={async (title) => {
				await updatePage.mutateAsync({ id: page.id, title });
				router.refresh();
			}}
			sharing={sharing}
			onRefresh={() => router.refresh()}
			onPreviewVersion={(version) => {
				router.push(version === null ? pathname : `${pathname}?v=${version}`);
			}}
			onDelete={async () => {
				await deletePage.mutateAsync({ id: page.id });
				router.replace("/");
			}}
		/>
	);
}

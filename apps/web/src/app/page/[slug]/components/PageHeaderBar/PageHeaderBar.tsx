"use client";

import {
	CommentModeToggle,
	PageHeader,
	type PageHeaderPage,
	type PageHeaderVersion,
} from "@superset/ui/page-comments";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/react";

interface PageHeaderBarProps {
	page: PageHeaderPage;
	versions: PageHeaderVersion[];
	currentUserId: string | undefined;
}

export function PageHeaderBar({
	page,
	versions,
	currentUserId,
}: PageHeaderBarProps) {
	const trpc = useTRPC();
	const router = useRouter();
	const setVisibility = useMutation(trpc.page.setVisibility.mutationOptions());
	const setSharedVersion = useMutation(
		trpc.page.setSharedVersion.mutationOptions(),
	);
	const deletePage = useMutation(trpc.page.delete.mutationOptions());

	return (
		<PageHeader
			page={page}
			versions={versions}
			currentUserId={currentUserId}
			trailing={<CommentModeToggle />}
			onSetVisibility={async (visibility) => {
				await setVisibility.mutateAsync({ id: page.id, visibility });
				router.refresh();
			}}
			onSetSharedVersion={async (version) => {
				await setSharedVersion.mutateAsync({ id: page.id, version });
				router.refresh();
			}}
			onDelete={async () => {
				await deletePage.mutateAsync({ id: page.id });
				router.replace("/");
			}}
		/>
	);
}

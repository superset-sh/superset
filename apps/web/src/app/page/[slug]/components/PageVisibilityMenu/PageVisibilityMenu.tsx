"use client";

import { authClient } from "@superset/auth/client";
import {
	type PageVisibility,
	PageVisibilityMenu as VisibilityMenu,
} from "@superset/ui/page-comments";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/react";

interface PageVisibilityMenuProps {
	pageId: string;
	visibility: PageVisibility;
	createdByUserId: string | null;
}

export function PageVisibilityMenu({
	pageId,
	visibility,
	createdByUserId,
}: PageVisibilityMenuProps) {
	const trpc = useTRPC();
	const router = useRouter();
	const { data: session } = authClient.useSession();
	const setVisibility = useMutation(trpc.page.setVisibility.mutationOptions());

	return (
		<VisibilityMenu
			visibility={visibility}
			createdByUserId={createdByUserId}
			currentUserId={session?.user?.id}
			onChange={async (next) => {
				await setVisibility.mutateAsync({ id: pageId, visibility: next });
				router.refresh();
			}}
		/>
	);
}

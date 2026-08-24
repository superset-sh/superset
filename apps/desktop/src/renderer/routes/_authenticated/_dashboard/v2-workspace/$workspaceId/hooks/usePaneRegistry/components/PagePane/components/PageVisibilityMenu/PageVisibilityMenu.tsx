import { authClient } from "@superset/auth/client";
import {
	type PageVisibility,
	PageVisibilityMenu as VisibilityMenu,
} from "@superset/ui/page-comments";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

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
	const { data: session } = authClient.useSession();
	const utils = cloudTrpc.useUtils();
	const setVisibility = cloudTrpc.page.setVisibility.useMutation();

	return (
		<VisibilityMenu
			visibility={visibility}
			createdByUserId={createdByUserId}
			currentUserId={session?.user?.id}
			onChange={async (next) => {
				await setVisibility.mutateAsync({ id: pageId, visibility: next });
				await Promise.all([
					utils.page.pull.invalidate({ id: pageId }),
					utils.page.list.invalidate(),
				]);
			}}
		/>
	);
}

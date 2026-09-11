import { useLingui } from "@lingui/react/macro";
import type { PageCommentUser } from "@superset/shared/page-comments";
import { useMemo } from "react";
import { useSession } from "@/lib/auth/client";

export function usePageCommentUser(): PageCommentUser {
	const { t } = useLingui();
	const { data: session } = useSession();

	return useMemo(
		() => ({
			id: session?.user.id ?? "",
			name: session?.user.name ?? t({ message: "You" }),
			image: session?.user.image ?? null,
		}),
		[session?.user.id, session?.user.name, session?.user.image, t],
	);
}

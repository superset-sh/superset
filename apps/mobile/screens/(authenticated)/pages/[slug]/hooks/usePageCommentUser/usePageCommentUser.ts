import { useLingui } from "@lingui/react/macro";
import {
	type PageCommentUser,
	pageCommentUser,
} from "@superset/shared/page-comments";
import { useMemo } from "react";
import { useSession } from "@/lib/auth/client";

export function usePageCommentUser(): PageCommentUser {
	const { t } = useLingui();
	const { data: session } = useSession();

	return useMemo(
		() => pageCommentUser(session, t({ message: "You" })),
		[session, t],
	);
}

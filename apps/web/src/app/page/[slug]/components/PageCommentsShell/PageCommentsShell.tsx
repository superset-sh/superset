"use client";

import { usePageComments } from "@superset/cloud-client";
import { errorMessage } from "@superset/i18n/errors";
import type { PageCommentUser } from "@superset/shared/page-comments";
import { CommentProvider } from "@superset/ui/page-comments";
import { toast } from "@superset/ui/sonner";
import type { ReactNode } from "react";

interface PageCommentsShellProps {
	pageId: string;
	version: number;
	user: PageCommentUser;
	pageOwnerId?: string | null;
	children: ReactNode;
}

export function PageCommentsShell({
	pageId,
	version,
	user,
	pageOwnerId,
	children,
}: PageCommentsShellProps) {
	const store = usePageComments({
		pageId,
		version,
		user,
		onError: (error) => toast.error(errorMessage(error)),
	});

	return (
		<CommentProvider user={user} store={store} pageOwnerId={pageOwnerId}>
			{children}
		</CommentProvider>
	);
}

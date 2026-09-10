"use client";

import {
	CommentProvider,
	type PageCommentUser,
} from "@superset/ui/page-comments";
import type { ReactNode } from "react";
import { usePageCommentStore } from "./hooks/usePageCommentStore";

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
	const store = usePageCommentStore({ pageId, version, user });
	return (
		<CommentProvider user={user} store={store} pageOwnerId={pageOwnerId}>
			{children}
		</CommentProvider>
	);
}

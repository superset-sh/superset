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
	children: ReactNode;
}

export function PageCommentsShell({
	pageId,
	version,
	user,
	children,
}: PageCommentsShellProps) {
	const store = usePageCommentStore({ pageId, version });
	return (
		<CommentProvider user={user} store={store}>
			{children}
		</CommentProvider>
	);
}

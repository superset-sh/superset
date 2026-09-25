"use client";

import { useComments } from "../../providers/CommentProvider";
import { CommentModeButton } from "./components/CommentModeButton";

export function CommentModeToggle() {
	const { enabled, toggleEnabled, threads } = useComments();

	return (
		<CommentModeButton
			enabled={enabled}
			openCount={threads.filter((thread) => !thread.resolved).length}
			onToggle={toggleEnabled}
		/>
	);
}

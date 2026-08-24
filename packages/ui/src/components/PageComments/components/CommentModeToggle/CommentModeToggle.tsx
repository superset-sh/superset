"use client";

import { MessageSquarePlus } from "lucide-react";
import { Toggle } from "../../../ui/toggle";
import { useComments } from "../../providers/CommentProvider";

export function CommentModeToggle() {
	const { enabled, toggleEnabled, threads } = useComments();
	const open = threads.filter((thread) => !thread.resolved).length;
	const label = enabled ? "Leave comment mode" : "Comment on this page";

	return (
		<Toggle
			size="sm"
			pressed={enabled}
			onPressedChange={toggleEnabled}
			aria-label={label}
			title={label}
			className="gap-1.5"
		>
			<MessageSquarePlus className="size-4" />
			{open > 0 ? (
				<span className="font-medium text-xs tabular-nums">{open}</span>
			) : null}
		</Toggle>
	);
}

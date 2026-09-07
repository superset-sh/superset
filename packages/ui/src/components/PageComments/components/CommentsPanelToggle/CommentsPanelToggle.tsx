"use client";

import { useLingui } from "@lingui/react/macro";
import { MessageSquare } from "lucide-react";
import { Button } from "../../../ui/button";
import { useComments } from "../../providers/CommentProvider";

/**
 * Opens the thread list on a narrow viewport, where it is a sheet rather than
 * a rail. Hidden from `md` up: there the list is already on screen.
 */
export function CommentsPanelToggle() {
	const { t } = useLingui();
	const { threads, panelOpen, setPanelOpen } = useComments();
	const openCount = threads.filter((thread) => !thread.resolved).length;
	const label = t({ message: "Show comments" });

	return (
		<Button
			size="sm"
			variant="ghost"
			aria-label={label}
			title={label}
			className="h-7 min-w-7 gap-1.5 px-2 md:hidden"
			onClick={() => setPanelOpen(!panelOpen)}
		>
			<MessageSquare className="size-3.5" />
			{openCount > 0 ? (
				<span className="font-medium text-xs tabular-nums">{openCount}</span>
			) : null}
		</Button>
	);
}

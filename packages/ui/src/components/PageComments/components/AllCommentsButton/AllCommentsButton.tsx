"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useRef } from "react";
import { cn } from "../../../../lib/utils";
import { Button } from "../../../ui/button";
import { useComments } from "../../providers/CommentProvider";

export function AllCommentsButton({ className }: { className?: string }) {
	const { t } = useLingui();
	const { threads, enabled, panelOpen, setPanelOpen } = useComments();
	const buttonRef = useRef<HTMLButtonElement>(null);
	const wasOpen = useRef(false);

	useEffect(() => {
		if (wasOpen.current && !panelOpen) buttonRef.current?.focus();
		wasOpen.current = panelOpen;
	}, [panelOpen]);

	if (panelOpen || (threads.length === 0 && !enabled)) return null;

	const openCount = threads.filter((thread) => !thread.resolved).length;

	return (
		<Button
			ref={buttonRef}
			data-comment-ui=""
			size="sm"
			variant="outline"
			aria-label={t({ message: "Show all comments" })}
			className={cn(
				"absolute top-3 right-3 z-40 gap-2 bg-popover shadow-md",
				className,
			)}
			onClick={() => setPanelOpen(true)}
		>
			<Trans>All comments</Trans>
			{openCount > 0 ? (
				<span className="text-muted-foreground text-xs tabular-nums">
					{openCount}
				</span>
			) : null}
		</Button>
	);
}

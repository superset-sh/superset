"use client";

import { useLingui } from "@lingui/react/macro";
import { MessageSquarePlus } from "lucide-react";
import { Toggle } from "../../../../../ui/toggle";

interface CommentModeButtonProps {
	enabled: boolean;
	openCount: number;
	onToggle: () => void;
	compact?: boolean;
}

export function CommentModeButton({
	enabled,
	openCount,
	onToggle,
	compact = false,
}: CommentModeButtonProps) {
	const { t } = useLingui();
	const label = enabled
		? t({ id: "ui.commentMode.leave", message: "Leave comment mode" })
		: t({ id: "ui.commentMode.enter", message: "Comment on this page" });

	if (compact) {
		return (
			<Toggle
				size="sm"
				pressed={enabled}
				onPressedChange={onToggle}
				aria-label={label}
				title={label}
				className="h-6 min-w-6 gap-1 px-1 text-muted-foreground/60 hover:text-muted-foreground data-[state=on]:text-foreground"
			>
				<MessageSquarePlus className="size-3.5" />
				{openCount > 0 ? (
					<span className="font-medium text-[11px] tabular-nums">
						{openCount}
					</span>
				) : null}
			</Toggle>
		);
	}

	return (
		<Toggle
			size="sm"
			pressed={enabled}
			onPressedChange={onToggle}
			aria-label={label}
			title={label}
			className="h-7 min-w-7 gap-1.5 px-2"
		>
			<MessageSquarePlus className="size-3.5" />
			{openCount > 0 ? (
				<span className="font-medium text-xs tabular-nums">{openCount}</span>
			) : null}
		</Toggle>
	);
}

/**
 * Reasoning/thinking block. Collapses to a one-line heading extracted
 * from the content; expand to see the full reasoning rendered as
 * markdown (paced when streaming, stable when settled).
 *
 * Phase 3.4 tail: previously showed "Reasoning (N chars)" which isn't
 * useful. Now emits the first heading / bold lead / truncated first
 * line via `extractReasoningHeading`.
 */

import type { ReasoningPart } from "@superset/chat/shared";
import { Brain } from "lucide-react";
import { useState } from "react";
import { PacedMarkdown } from "./Markdown";
import type { PartProps } from "./parts";
import { extractReasoningHeading } from "./reasoningHeading";

export function ReasoningPartView({ part, active }: PartProps<ReasoningPart>) {
	const [expanded, setExpanded] = useState(false);
	if (!part.text) return null;

	const heading = extractReasoningHeading(part.text);

	return (
		<div className="border-border my-2 rounded-md border px-3 py-2">
			<button
				type="button"
				className="text-muted-foreground hover:text-foreground flex w-full items-start justify-between gap-2 text-left text-xs"
				onClick={() => setExpanded((v) => !v)}
			>
				<div className="flex min-w-0 items-center gap-2">
					<Brain className="size-3.5 shrink-0" aria-hidden />
					<span className="shrink-0 font-medium">Thinking</span>
					{heading && (
						<span className="text-muted-foreground min-w-0 truncate text-[11px] italic">
							— {heading}
						</span>
					)}
				</div>
				<span className="shrink-0">{expanded ? "▾" : "▸"}</span>
			</button>
			{expanded && (
				<div className="mt-2 text-[12px] leading-relaxed">
					<PacedMarkdown text={part.text} live={active} />
				</div>
			)}
		</div>
	);
}

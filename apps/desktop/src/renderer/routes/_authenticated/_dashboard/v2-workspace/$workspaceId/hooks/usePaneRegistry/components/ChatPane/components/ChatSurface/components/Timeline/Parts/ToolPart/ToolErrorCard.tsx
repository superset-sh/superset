/**
 * Red-tinted collapsible error card replacing whatever tool-specific
 * renderer would normally run when the tool state is "error". Ported
 * from OpenCode's tool-error-card.tsx.
 *
 * Behaviour:
 *   - collapsed state: icon + tool name + first line of error
 *   - expanded: full error text + copy-to-clipboard (2s "Copied!" feedback)
 *
 * Plan reference: 20260421-v2-chat-opencode-ui-components.md §Tier 1.
 */

import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { ChevronDown, CircleAlert } from "lucide-react";
import { useCallback, useState } from "react";
import { cleanErrorText, firstLineOfError } from "./ToolErrorCard.logic";

export interface ToolErrorCardProps {
	tool: string;
	/** Raw error message (may include "Error: " prefix, stack, etc.). */
	error: string;
	/** Optional subtitle override; defaults to firstLineOfError(cleaned). */
	subtitle?: string;
	/** Optional link (e.g. for task errors that link to the subagent session). */
	href?: string;
}

export function ToolErrorCard({
	tool,
	error,
	subtitle,
	href,
}: ToolErrorCardProps) {
	const [open, setOpen] = useState(false);
	const cleaned = cleanErrorText(error);
	const firstLine = subtitle ?? firstLineOfError(cleaned);

	const [copied, setCopied] = useState(false);
	const onCopy = useCallback(() => {
		void navigator.clipboard.writeText(cleaned).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		});
	}, [cleaned]);

	const Title = (
		<span className="inline-flex items-center gap-2 text-sm">
			<span className="text-foreground font-medium">{tool}</span>
			<span className="text-muted-foreground min-w-0 truncate text-xs">
				{firstLine}
			</span>
		</span>
	);

	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			className="border-destructive/30 bg-destructive/5 my-2 rounded-md border"
		>
			<CollapsibleTrigger
				data-state={open ? "open" : "closed"}
				className="hover:bg-destructive/10 flex w-full items-center gap-2 px-3 py-2 text-left transition-colors"
			>
				<CircleAlert
					className="text-destructive size-4 shrink-0"
					aria-hidden
				/>
				<div className="min-w-0 flex-1">{Title}</div>
				<ChevronDown
					data-slot="basic-tool-chevron"
					className="text-muted-foreground size-3.5 shrink-0"
					aria-hidden
				/>
			</CollapsibleTrigger>
			<CollapsibleContent data-slot="basic-tool-content">
				<div className="border-destructive/20 border-t px-3 py-2">
					<div className="flex items-start justify-between gap-2">
						<pre className="text-destructive flex-1 whitespace-pre-wrap break-words font-mono text-[11px]">
							{cleaned}
						</pre>
						<button
							type="button"
							onClick={onCopy}
							className="text-muted-foreground hover:text-foreground shrink-0 rounded px-1.5 py-0.5 text-[11px]"
						>
							{copied ? "Copied!" : "Copy"}
						</button>
					</div>
					{href && (
						<a
							href={href}
							className="text-muted-foreground hover:text-foreground mt-1 block text-[11px] underline"
						>
							open context ↗
						</a>
					)}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

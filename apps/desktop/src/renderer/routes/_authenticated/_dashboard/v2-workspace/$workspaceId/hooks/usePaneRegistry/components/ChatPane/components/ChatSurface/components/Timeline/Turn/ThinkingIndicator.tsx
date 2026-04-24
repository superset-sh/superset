/**
 * Minimal "Thinking…" indicator. Replaced by the OpenCode-ported
 * TextShimmer in Phase 3 (plans/20260421-v2-chat-opencode-ui-components.md).
 */

export function ThinkingIndicator() {
	return (
		<div className="my-3 inline-flex items-center gap-2 text-xs">
			<span
				className="bg-muted-foreground/70 inline-block size-1.5 animate-pulse rounded-full"
				style={{ animationDelay: "0ms" }}
			/>
			<span
				className="bg-muted-foreground/70 inline-block size-1.5 animate-pulse rounded-full"
				style={{ animationDelay: "150ms" }}
			/>
			<span
				className="bg-muted-foreground/70 inline-block size-1.5 animate-pulse rounded-full"
				style={{ animationDelay: "300ms" }}
			/>
			<span className="text-muted-foreground ml-1">Thinking…</span>
		</div>
	);
}

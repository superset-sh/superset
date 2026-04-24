/**
 * Pulsing gradient shimmer on text. Ported from OpenCode's
 * text-shimmer.tsx + .css (temp/opencode/packages/ui/src/components/).
 * Used on pending tool titles, "Thinking…" indicators, and anywhere
 * else the UI signals work-in-progress.
 *
 * Two stacked text layers: the base layer is full opacity while
 * inactive; when activated, the sweep layer (a background-clipped
 * gradient) cross-fades over the top with a looping translate
 * animation. Swap delay (220 ms) prevents flicker on rapid state
 * changes.
 *
 * Plan reference: 20260421-v2-chat-opencode-ui-components.md §Tier 1.
 */

import { useEffect, useState } from "react";
import "./TextShimmer.css";

export interface TextShimmerProps {
	text: string;
	/** When true the shimmer animation runs; when false the base text is shown. */
	active?: boolean;
	/**
	 * Phase offset (ms multiples of --text-shimmer-step). Used so
	 * multiple adjacent shimmers don't all sweep in perfect sync.
	 */
	offset?: number;
	className?: string;
}

const SWAP_MS = 220;

export function TextShimmer({
	text,
	active = true,
	offset = 0,
	className,
}: TextShimmerProps) {
	const [run, setRun] = useState(active);

	useEffect(() => {
		if (active) {
			setRun(true);
			return;
		}
		const timer = setTimeout(() => setRun(false), SWAP_MS);
		return () => clearTimeout(timer);
	}, [active]);

	return (
		<span
			data-component="text-shimmer"
			data-active={active ? "true" : "false"}
			className={className}
			aria-label={text}
			style={
				{
					"--text-shimmer-swap": `${SWAP_MS}ms`,
					"--text-shimmer-index": String(offset),
				} as React.CSSProperties
			}
		>
			<span data-slot="text-shimmer-char">
				<span data-slot="text-shimmer-char-base" aria-hidden="true">
					{text}
				</span>
				<span
					data-slot="text-shimmer-char-shimmer"
					data-run={run ? "true" : "false"}
					aria-hidden="true"
				>
					{text}
				</span>
			</span>
		</span>
	);
}

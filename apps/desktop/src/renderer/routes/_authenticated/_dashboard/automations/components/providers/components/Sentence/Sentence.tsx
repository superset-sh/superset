import type { ReactNode } from "react";

interface SentenceProps<Slot extends string> {
	/** The grammar's parts for the config's event; undefined for an unknown event. */
	parts: readonly ({ text: string } | { slot: Slot })[] | undefined;
	/**
	 * Rendered raw when `parts` is missing. The event comes from a persisted
	 * config; if its grammar entry is ever removed or renamed, the row must
	 * still render — a thrown error here takes the whole editor down — so an
	 * unknown event reads as its raw name rather than as nothing.
	 */
	fallback?: string;
	/** Renders one slot chip. Chips are list items: set `key={index}`. */
	renderSlot: (slot: Slot, index: number) => ReactNode;
}

export function Sentence<Slot extends string>({
	parts,
	fallback,
	renderSlot,
}: SentenceProps<Slot>) {
	if (!parts) {
		return (
			<span className="text-[13px] text-muted-foreground">{fallback}</span>
		);
	}
	return (
		<>
			{parts.map((part, index) =>
				"text" in part ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: grammar parts are a static sentence that never reorders
					<span key={index} className="text-[13px] text-muted-foreground">
						{part.text}
					</span>
				) : (
					renderSlot(part.slot, index)
				),
			)}
		</>
	);
}

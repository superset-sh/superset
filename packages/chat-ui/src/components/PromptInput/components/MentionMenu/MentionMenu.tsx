"use client";

import { Trans } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { useEffect } from "react";
import type { MentionSection } from "../../hooks/useMentionSources";
import type { ComposerMentionEntry } from "../../types";

export type MentionMenuProps = {
	sections: MentionSection[];
	selectedIndex: number | null;
	onHighlight: (index: number) => void;
	onSelect: (entry: ComposerMentionEntry) => void;
	onSelectionChange?: (entry: ComposerMentionEntry | null) => void;
};

export function MentionMenu({
	sections,
	selectedIndex,
	onHighlight,
	onSelect,
	onSelectionChange,
}: MentionMenuProps) {
	const flatEntries = sections.flatMap((section) => section.entries);

	// biome-ignore lint/correctness/useExhaustiveDependencies: flatEntries identity churns per render; selection identity is (index, length)
	useEffect(() => {
		onSelectionChange?.(
			selectedIndex == null ? null : (flatEntries[selectedIndex] ?? null),
		);
	}, [selectedIndex, flatEntries.length]);

	if (sections.length === 0) return null;
	let flatIndex = -1;
	return (
		<div
			role="listbox"
			className="relative z-50 w-full rounded-2xl bg-popover/95 p-1.5 shadow-xl ring-1 ring-border backdrop-blur-sm"
		>
			<div className="scroll-fade max-h-96 overflow-y-auto">
				{sections.map((section) => (
					<div key={section.providerId}>
						<p className="px-3 pt-2.5 pb-1 text-[13px] text-muted-foreground">
							{section.title}
						</p>
						{section.isLoading && section.entries.length === 0 && (
							<p className="px-3 pb-2 text-[15px] text-muted-foreground/60">
								{section.loadingState ?? <Trans>Loading…</Trans>}
							</p>
						)}
						{!section.isLoading &&
							section.emptyState != null &&
							section.entries.length === 0 && (
								<p className="px-3 pb-2 text-[15px] text-muted-foreground/60">
									{section.emptyState}
								</p>
							)}
						{section.entries.map((entry) => {
							flatIndex += 1;
							const index = flatIndex;
							return (
								// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by the editor
								// biome-ignore lint/a11y/useFocusableInteractive: focus stays in the editor; listbox is virtual
								<div
									key={entry.id}
									role="option"
									aria-selected={index === selectedIndex}
									className={cn(
										"flex cursor-pointer items-center gap-2.5 rounded-[10px] px-3 py-[5px] text-[15px] leading-[21px]",
										index === selectedIndex
											? "bg-accent text-accent-foreground"
											: "text-foreground",
									)}
									onMouseEnter={() => onHighlight(index)}
									onMouseDown={(event) => event.preventDefault()}
									onClick={() => onSelect(entry)}
								>
									{entry.icon && (
										<span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
											{entry.icon}
										</span>
									)}
									<span className="shrink-0 font-medium">{entry.label}</span>
									{entry.description && (
										<span className="min-w-0 truncate text-muted-foreground">
											{entry.description}
										</span>
									)}
								</div>
							);
						})}
					</div>
				))}
			</div>
		</div>
	);
}

import { useMemo } from "react";
import type { PaneMruEntry } from "renderer/stores/pane-mru";
import type { MruCycle } from "../../hooks/usePaneMruSwitcher";
import { useLiveEntryNames } from "../../hooks/usePaneMruSwitcher/useLiveEntryNames";
import { PullRequestStateIcon } from "../PullRequestStateIcon";
import { PaneMruIcon } from "./components/PaneMruIcon";
import { PaneMruProjectIcon } from "./components/PaneMruProjectIcon";
import { PaneMruStatusDot } from "./components/PaneMruStatusDot";
import { describeEntry } from "./describeEntry";

/** Keeps the overlay a fixed size no matter how long the MRU list grows. */
const MAX_VISIBLE = 10;

interface PaneMruSwitcherProps {
	cycle: MruCycle | null;
}

/**
 * The switcher overlay, visible only while Ctrl is held.
 *
 * Deliberately not a Dialog: it must not take focus, must not be dismissible
 * by clicking outside, and must not trap the keyboard — the whole interaction
 * is driven by the modifier key, and the pane underneath keeps its focus so
 * releasing Ctrl lands somewhere sensible.
 *
 * The contents live in a child so that everything the overlay reads — live
 * workspace, project and pull-request data — is only subscribed to while a
 * cycle is running, and re-renders stay inside the overlay rather than
 * reaching the dashboard layout that renders it.
 */
export function PaneMruSwitcher({ cycle }: PaneMruSwitcherProps) {
	if (!cycle) return null;
	return <PaneMruSwitcherOverlay cycle={cycle} />;
}

function PaneMruSwitcherOverlay({ cycle }: { cycle: MruCycle }) {
	const withLiveNames = useLiveEntryNames();
	const entries = useMemo(
		() => cycle.entries.map(withLiveNames),
		[cycle.entries, withLiveNames],
	);

	const visible = entries.slice(0, MAX_VISIBLE);
	const hiddenCount = entries.length - visible.length;

	return (
		<div
			aria-hidden="true"
			className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
		>
			<div className="pointer-events-none w-[min(38rem,85vw)] overflow-hidden rounded-xl border border-border bg-popover/95 shadow-2xl backdrop-blur-sm">
				<div className="px-4 pt-2.5 pb-1 text-muted-foreground text-sm">
					Recently used
				</div>
				{/* No max-height or scroll: the list is capped at MAX_VISIBLE rows,
				    so it always fits. A scrollbar in a keyboard-driven overlay is
				    useless anyway — you cannot reach the hidden rows with the mouse
				    while Ctrl is held. */}
				<ul className="py-1">
					{visible.map((entry, index) => (
						<PaneMruSwitcherRow
							key={`${entry.workspaceId}:${entry.paneId}`}
							entry={entry}
							isSelected={index === cycle.selectedIndex}
						/>
					))}
				</ul>
				{hiddenCount > 0 && (
					<div className="border-border/60 border-t px-4 py-2 text-muted-foreground text-sm">
						+{hiddenCount} more
					</div>
				)}
			</div>
		</div>
	);
}

function PaneMruSwitcherRow({
	entry,
	isSelected,
}: {
	entry: PaneMruEntry;
	isSelected: boolean;
}) {
	const { primary, secondary } = describeEntry(entry);

	return (
		<li
			className={`flex items-center gap-2.5 px-4 py-2 text-base ${
				isSelected ? "bg-accent text-accent-foreground" : "text-foreground"
			}`}
		>
			<PaneMruProjectIcon entry={entry} />
			<span className="min-w-0 flex-1 truncate">{primary}</span>
			<PaneMruStatusDot entry={entry} />
			<span className="max-w-[40%] shrink-0 truncate text-muted-foreground text-sm">
				{secondary}
			</span>
			{entry.pullRequestState && (
				<PullRequestStateIcon state={entry.pullRequestState} />
			)}
			<PaneMruIcon entry={entry} />
		</li>
	);
}

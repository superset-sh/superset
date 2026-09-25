import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { LuChevronRight } from "react-icons/lu";

interface DiffFileCollapseButtonProps {
	collapsed: boolean;
	onToggle: () => void;
}

/**
 * Per-file collapse chevron rendered into a card-styled diff header's prefix
 * slot (renderHeaderPrefix). stopPropagation keeps the toggle from also
 * triggering Pierre's own header click handling. Message ids stay under
 * dashboard.pullRequests.codeTab.* — this button moved here verbatim from
 * PullRequestCodeTab, and keeping the ids keeps existing translations valid.
 */
export function DiffFileCollapseButton({
	collapsed,
	onToggle,
}: DiffFileCollapseButtonProps) {
	const { t } = useLingui();
	return (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				onToggle();
			}}
			aria-label={
				collapsed
					? t({
							message: "Expand file",
						})
					: t({
							message: "Collapse file",
						})
			}
			className="flex size-4 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
		>
			<LuChevronRight
				className={cn(
					"size-3 shrink-0 transition-transform",
					!collapsed && "rotate-90",
				)}
				strokeWidth={1.5}
			/>
		</button>
	);
}

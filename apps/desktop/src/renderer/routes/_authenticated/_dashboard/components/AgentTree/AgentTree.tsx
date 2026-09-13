import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { ChevronRight } from "lucide-react";
import { type KeyboardEvent, useCallback, useMemo, useState } from "react";
import { useNow } from "renderer/hooks/useNow";
import { AgentTreeRow, type AgentTreeVariant } from "./components/AgentTreeRow";
import type { AgentTreeData, AgentTreeNode } from "./utils/buildAgentTree";

interface AgentTreeProps {
	tree: AgentTreeData;
	variant: AgentTreeVariant;
	onOpen: (node: AgentTreeNode) => void;
	selectedKey?: string;
	className?: string;
}

interface VisibleRow {
	node: AgentTreeNode;
	guides: boolean[];
	isLast: boolean;
}

function visibleRows(
	nodes: readonly AgentTreeNode[],
	collapsed: ReadonlySet<string>,
	guides: boolean[],
	out: VisibleRow[],
): VisibleRow[] {
	nodes.forEach((node, index) => {
		const isLast = index === nodes.length - 1;
		out.push({ node, guides, isLast });
		if (node.children.length > 0 && !collapsed.has(node.key)) {
			visibleRows(node.children, collapsed, [...guides, !isLast], out);
		}
	});
	return out;
}

/**
 * Agents and their nested subagents as an expandable tree. Rows open the
 * node (a terminal pane or a subagent transcript); chevrons fold a branch.
 * Arrow keys move between visible rows, ←/→ fold and unfold, Enter opens.
 * The sidebar variant is single-line with the detail in a tooltip; the card
 * and menu variants carry the activity line.
 */
export function AgentTree({
	tree,
	variant,
	onOpen,
	selectedKey,
	className,
}: AgentTreeProps) {
	const { t } = useLingui();
	const now = useNow(1000).getTime();
	const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
		() => new Set(),
	);
	const [endedOpen, setEndedOpen] = useState(variant !== "sidebar");

	const toggle = useCallback((node: AgentTreeNode) => {
		setCollapsed((previous) => {
			const next = new Set(previous);
			if (next.has(node.key)) next.delete(node.key);
			else next.add(node.key);
			return next;
		});
	}, []);

	const liveRows = useMemo(
		() => visibleRows(tree.live, collapsed, [], []),
		[tree.live, collapsed],
	);
	const endedRows = useMemo(
		() => (endedOpen ? visibleRows(tree.ended, collapsed, [], []) : []),
		[tree.ended, collapsed, endedOpen],
	);

	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
		const rows = Array.from(
			event.currentTarget.querySelectorAll<HTMLButtonElement>(
				"[data-agent-tree-row]",
			),
		);
		if (rows.length === 0) return;
		const active = document.activeElement;
		const index = rows.indexOf(active as HTMLButtonElement);
		const nextIndex =
			event.key === "ArrowDown"
				? Math.min(rows.length - 1, index + 1)
				: Math.max(0, index - 1);
		event.preventDefault();
		rows[nextIndex]?.focus();
	};

	const endedLabel = t({
		message: plural(tree.ended.length, { one: "# ended", other: "# ended" }),
	});

	return (
		<div
			role="tree"
			aria-label={t({ message: "Agents" })}
			className={cn("flex flex-col", className)}
			onKeyDown={handleKeyDown}
			onFocus={(event) => {
				if (event.target !== event.currentTarget) return;
				event.currentTarget
					.querySelector<HTMLButtonElement>("[data-agent-tree-row]")
					?.focus();
			}}
			tabIndex={liveRows.length + endedRows.length > 0 ? 0 : -1}
		>
			{liveRows.map(({ node, guides, isLast }) => (
				<AgentTreeRow
					key={node.key}
					node={node}
					variant={variant}
					guides={guides}
					isLast={isLast}
					expanded={!collapsed.has(node.key)}
					selected={node.key === selectedKey}
					now={now}
					onOpen={onOpen}
					onToggle={toggle}
				/>
			))}
			{tree.ended.length > 0 && (
				<>
					<button
						type="button"
						onClick={() => setEndedOpen((open) => !open)}
						aria-expanded={endedOpen}
						className={cn(
							"flex items-center gap-1 rounded-sm px-1 py-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase hover:text-foreground",
							variant === "sidebar" ? "mt-0.5" : "mt-1 border-t border-border",
						)}
					>
						<ChevronRight
							className={cn(
								"size-3 transition-transform",
								endedOpen && "rotate-90",
							)}
						/>
						{endedLabel}
					</button>
					{endedRows.map(({ node, guides, isLast }) => (
						<AgentTreeRow
							key={node.key}
							node={node}
							variant={variant}
							guides={guides}
							isLast={isLast}
							expanded={!collapsed.has(node.key)}
							selected={node.key === selectedKey}
							now={now}
							onOpen={onOpen}
							onToggle={toggle}
						/>
					))}
				</>
			)}
		</div>
	);
}

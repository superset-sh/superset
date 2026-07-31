import { LuBot } from "react-icons/lu";
import type { FactoryStage, FactoryWorkItem } from "../../types";
import { getFactoryStageLabel } from "../../utils/factory-utils";
import { FactoryWorkItemCard } from "../FactoryWorkItemCard";

interface FactoryColumnProps {
	stage: FactoryStage;
	items: FactoryWorkItem[];
	selectedItemId: string | null;
	onSelectItem: (item: FactoryWorkItem) => void;
}

export function FactoryColumn({
	stage,
	items,
	selectedItemId,
	onSelectItem,
}: FactoryColumnProps) {
	const activeAgents = items.filter((item) => item.metadata.agent).length;

	return (
		<section
			aria-labelledby={`factory-stage-${stage}`}
			className="flex w-64 shrink-0 flex-col border-r border-border/60 last:border-r-0"
		>
			<header className="sticky top-0 z-10 flex h-10 items-center gap-2 border-b border-border/60 bg-background px-3">
				<h2
					id={`factory-stage-${stage}`}
					className="text-xs font-semibold text-foreground"
				>
					{getFactoryStageLabel(stage)}
				</h2>
				<span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-xs font-medium tabular-nums text-muted-foreground">
					{items.length}
				</span>
				{activeAgents > 0 && (
					<span
						className="ml-auto flex items-center gap-1 text-xs tabular-nums text-muted-foreground"
						title={`${activeAgents} active ${activeAgents === 1 ? "agent" : "agents"}`}
					>
						<LuBot className="size-3 text-primary" />
						{activeAgents}
					</span>
				)}
			</header>

			<div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
				{items.map((item) => (
					<FactoryWorkItemCard
						key={item.id}
						item={item}
						selected={selectedItemId === item.id}
						onSelect={() => onSelectItem(item)}
					/>
				))}
				{items.length === 0 && (
					<div className="flex h-20 items-center justify-center rounded-md border border-dashed border-border/70 px-3 text-center text-xs text-muted-foreground">
						No work in this stage
					</div>
				)}
			</div>
		</section>
	);
}

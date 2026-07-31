import { useMemo } from "react";
import type {
	FactoryBoardKind,
	FactoryStage,
	FactoryWorkItem,
} from "../../types";
import {
	belongsToFactoryBoard,
	getFactoryStage,
} from "../../utils/factory-utils";
import { FactoryColumn } from "../FactoryColumn";

const WORK_STAGES: FactoryStage[] = [
	"intake",
	"triage",
	"planning",
	"execute",
	"review",
	"done",
];
const REVIEW_STAGES: FactoryStage[] = ["review", "done"];

interface FactoryBoardProps {
	board: FactoryBoardKind;
	items: FactoryWorkItem[];
	query: string;
	selectedItemId: string | null;
	onSelectItem: (item: FactoryWorkItem) => void;
}

export function FactoryBoard({
	board,
	items,
	query,
	selectedItemId,
	onSelectItem,
}: FactoryBoardProps) {
	const stages = board === "work" ? WORK_STAGES : REVIEW_STAGES;
	const normalizedQuery = query.trim().toLowerCase();
	const visibleItems = useMemo(
		() =>
			items.filter(
				(item) =>
					belongsToFactoryBoard(item, board) &&
					(normalizedQuery.length === 0 ||
						item.title.toLowerCase().includes(normalizedQuery) ||
						item.sourceKey?.toLowerCase().includes(normalizedQuery) ||
						item.metadata.project?.toLowerCase().includes(normalizedQuery)),
			),
		[board, items, normalizedQuery],
	);
	const hasNoSearchResults =
		normalizedQuery.length > 0 && visibleItems.length === 0;

	return (
		<div
			className="min-h-0 min-w-0 flex-1 overflow-auto"
			data-testid="factory-board-scroll"
		>
			{hasNoSearchResults ? (
				<div className="flex h-full min-h-64 items-center justify-center px-6 text-center">
					<div>
						<p className="text-sm font-medium text-foreground">
							No matching Factory work
						</p>
						<p className="mt-1 text-xs text-muted-foreground">
							Try a title, issue number, or repository name.
						</p>
					</div>
				</div>
			) : (
				<div className="flex min-h-full min-w-max">
					{stages.map((stage) => (
						<FactoryColumn
							key={stage}
							stage={stage}
							items={visibleItems.filter(
								(item) => getFactoryStage(item) === stage,
							)}
							selectedItemId={selectedItemId}
							onSelectItem={onSelectItem}
						/>
					))}
				</div>
			)}
		</div>
	);
}

import {
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	MouseSensor,
	TouchSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { useLingui } from "@lingui/react/macro";
import { type UIEvent, useCallback, useMemo, useState } from "react";
import { useLinearIssueActions } from "../../../../../../hooks/useLinearIssueActions";
import type {
	LinearIssue,
	LinearState,
	LinearWorkspace,
} from "../../../../../../utils/linearIssueTypes";
import type { TabValue } from "../../../TasksTopBar";
import { LinearBoardCard } from "./components/LinearBoardCard";
import { LinearBoardColumn } from "./components/LinearBoardColumn";
import {
	type BoardColumn,
	buildBoardColumns,
	columnKeyFor,
} from "./utils/buildBoardColumns";

const LOAD_MORE_DISTANCE = 400;

interface LinearIssueBoardProps {
	issues: LinearIssue[];
	workspace: LinearWorkspace | undefined;
	teamId: string | null;
	status: TabValue;
	onOpen: (issue: LinearIssue) => void;
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	onLoadMore: () => void;
}

export function LinearIssueBoard({
	issues,
	workspace,
	teamId,
	status,
	onOpen,
	hasNextPage,
	isFetchingNextPage,
	onLoadMore,
}: LinearIssueBoardProps) {
	const { t } = useLingui();
	const { update } = useLinearIssueActions();
	const [activeIssue, setActiveIssue] = useState<LinearIssue | null>(null);
	const sensors = useSensors(
		useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
		useSensor(TouchSensor, {
			activationConstraint: { delay: 200, tolerance: 5 },
		}),
	);

	const team = teamId
		? workspace?.teams.find((candidate) => candidate.id === teamId)
		: undefined;
	const typeNames: Record<BoardColumn["type"], string> = {
		backlog: t({ message: "Backlog" }),
		unstarted: t({ message: "Todo" }),
		started: t({ message: "In progress" }),
		completed: t({ message: "Done" }),
		canceled: t({ message: "Canceled" }),
	};
	const columns = buildBoardColumns({
		teamStates: team?.states,
		status,
		typeNames,
	});

	const issuesByColumn = useMemo(() => {
		const map = new Map<string, LinearIssue[]>();
		for (const issue of issues) {
			const key = columnKeyFor(issue.state, !!team);
			map.set(key, [...(map.get(key) ?? []), issue]);
		}
		return map;
	}, [issues, team]);

	const stateForDrop = useCallback(
		(issue: LinearIssue, column: BoardColumn): LinearState | undefined => {
			if (column.stateId) {
				return team?.states.find((state) => state.id === column.stateId);
			}
			const issueTeam = workspace?.teams.find(
				(candidate) => candidate.id === issue.team.id,
			);
			return issueTeam?.states.find((state) => state.type === column.type);
		},
		[team, workspace],
	);

	const handleDragStart = (event: DragStartEvent) => {
		setActiveIssue(
			issues.find((issue) => issue.id === event.active.id) ?? null,
		);
	};

	const handleDragEnd = (event: DragEndEvent) => {
		setActiveIssue(null);
		const column = event.over?.data.current?.column as BoardColumn | undefined;
		const issue = issues.find((candidate) => candidate.id === event.active.id);
		if (!column || !issue) return;
		if (columnKeyFor(issue.state, !!team) === column.key) return;
		const state = stateForDrop(issue, column);
		if (state) update(issue, { stateId: state.id });
	};

	const handleColumnScroll = useCallback(
		(event: UIEvent<HTMLDivElement>) => {
			if (!hasNextPage || isFetchingNextPage) return;
			const { scrollTop, clientHeight, scrollHeight } = event.currentTarget;
			if (scrollHeight - scrollTop - clientHeight > LOAD_MORE_DISTANCE) return;
			onLoadMore();
		},
		[hasNextPage, isFetchingNextPage, onLoadMore],
	);

	return (
		<DndContext
			sensors={sensors}
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}
			onDragCancel={() => setActiveIssue(null)}
		>
			<div className="flex min-h-0 min-w-0 flex-1 gap-2 overflow-x-auto overflow-y-hidden px-4 py-3">
				{columns.map((column) => (
					<LinearBoardColumn
						key={column.key}
						column={column}
						issues={issuesByColumn.get(column.key) ?? []}
						onOpen={onOpen}
						onScroll={handleColumnScroll}
					/>
				))}
			</div>
			<DragOverlay dropAnimation={null}>
				{activeIssue && (
					<div className="w-[268px]">
						<LinearBoardCard issue={activeIssue} onOpen={() => {}} overlay />
					</div>
				)}
			</DragOverlay>
		</DndContext>
	);
}

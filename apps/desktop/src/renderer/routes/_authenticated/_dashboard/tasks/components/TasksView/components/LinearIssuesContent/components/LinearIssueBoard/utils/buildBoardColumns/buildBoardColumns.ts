import type { LinearState } from "../../../../../../../../utils/linearIssueTypes";
import type { TabValue } from "../../../../../TasksTopBar";

type ColumnType =
	| "backlog"
	| "unstarted"
	| "started"
	| "completed"
	| "canceled";

export interface BoardColumn {
	key: string;
	name: string;
	type: ColumnType;
	color: string;
	stateId: string | null;
}

const TYPE_ORDER: ColumnType[] = [
	"backlog",
	"unstarted",
	"started",
	"completed",
	"canceled",
];

const TYPE_COLORS: Record<ColumnType, string> = {
	backlog: "#95a2b3",
	unstarted: "#e2e2e2",
	started: "#f2c94c",
	completed: "#5e6ad2",
	canceled: "#95a2b3",
};

const TYPES_BY_FILTER: Record<TabValue, ColumnType[]> = {
	all: TYPE_ORDER,
	active: ["unstarted", "started"],
	backlog: ["backlog"],
	unstarted: ["unstarted"],
	started: ["started"],
	completed: ["completed"],
	canceled: ["canceled"],
};

function columnType(stateType: LinearState["type"]): ColumnType {
	return stateType === "triage" ? "backlog" : stateType;
}

export function columnKeyFor(state: LinearState, byTeamState: boolean): string {
	return byTeamState ? state.id : columnType(state.type);
}

export function buildBoardColumns({
	teamStates,
	status,
	typeNames,
}: {
	teamStates: LinearState[] | undefined;
	status: TabValue;
	typeNames: Record<ColumnType, string>;
}): BoardColumn[] {
	const visibleTypes = new Set(TYPES_BY_FILTER[status]);
	if (teamStates) {
		return teamStates
			.filter((state) => visibleTypes.has(columnType(state.type)))
			.sort(
				(a, b) =>
					TYPE_ORDER.indexOf(columnType(a.type)) -
						TYPE_ORDER.indexOf(columnType(b.type)) || a.position - b.position,
			)
			.map((state) => ({
				key: state.id,
				name: state.name,
				type: columnType(state.type),
				color: state.color,
				stateId: state.id,
			}));
	}
	return TYPE_ORDER.filter((type) => visibleTypes.has(type)).map((type) => ({
		key: type,
		name: typeNames[type],
		type,
		color: TYPE_COLORS[type],
		stateId: null,
	}));
}

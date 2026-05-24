import { useState } from "react";
import type { SessionsListAppliedFilter } from "../../components/SessionsList";
import { SessionsList } from "../../components/SessionsList";
import { MOCK_PROJECT_NAME, MOCK_SESSIONS } from "../../mock-data";

export type SessionsListLoadedProps = {
	className?: string;
	filterCount?: number;
	appliedFilters?: ReadonlyArray<SessionsListAppliedFilter>;
};

/**
 * UC-NAV §A — canonical loaded sessions-list with project-first chrome.
 * 5 session rows showing the full status spectrum (live × 2, idle, warning,
 * archived). Configurable filter count + applied-filter row via props.
 */
export function SessionsListLoaded({
	className,
	filterCount = 0,
	appliedFilters,
}: SessionsListLoadedProps) {
	const [search, setSearch] = useState("");

	return (
		<SessionsList
			className={className}
			projectName={MOCK_PROJECT_NAME}
			sessions={MOCK_SESSIONS}
			appliedFilters={appliedFilters}
			headerProps={{
				variant: "multi-project",
				searchValue: search,
				onSearchChange: setSearch,
				onClearSearch: () => setSearch(""),
				filterCount,
				onMenuPress: () => {},
				onProjectChipPress: () => {},
				onFilterPress: () => {},
			}}
			onSessionPress={() => {}}
			onSessionLongPress={() => {}}
			onNewChatPress={() => {}}
		/>
	);
}

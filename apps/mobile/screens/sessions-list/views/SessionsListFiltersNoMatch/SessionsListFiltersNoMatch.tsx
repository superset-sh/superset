import { Settings } from "lucide-react-native";
import { useState } from "react";
import { Pressable } from "react-native";
import { EmptyState } from "@/components/EmptyState";
import { Text } from "@/components/ui/text";
import type { SessionsListAppliedFilter } from "../../components/SessionsList";
import { SessionsList } from "../../components/SessionsList";
import { MOCK_PROJECT_NAME } from "../../mock-data";

export type SessionsListFiltersNoMatchProps = {
	className?: string;
};

const INITIAL_FILTERS: ReadonlyArray<SessionsListAppliedFilter> = [
	{ id: "f1", kind: "workspace", label: "main · desktop" },
	{ id: "f2", kind: "status", label: "Streaming" },
];

/**
 * UC-NAV-06.5 — applied filters yield zero matches. Multi-project chip with
 * `·N` badge on filter button + AppliedFilterTag row below header showing
 * the 2 filters. Body: settings icon + "No matches" + Clear filters CTA.
 * No FAB.
 */
export function SessionsListFiltersNoMatch({
	className,
}: SessionsListFiltersNoMatchProps) {
	const [filters, setFilters] =
		useState<ReadonlyArray<SessionsListAppliedFilter>>(INITIAL_FILTERS);

	const clearAll = () => setFilters([]);

	return (
		<SessionsList
			className={className}
			projectName={MOCK_PROJECT_NAME}
			sessions={[]}
			showFab={false}
			appliedFilters={filters}
			onFilterDismiss={(id) =>
				setFilters((curr) => curr.filter((f) => f.id !== id))
			}
			onClearFilters={clearAll}
			headerProps={{
				variant: "multi-project",
				filterCount: filters.length,
				onMenuPress: () => {},
				onProjectChipPress: () => {},
				onFilterPress: () => {},
			}}
			emptyBody={
				<EmptyState
					icon={Settings}
					heading="No matches"
					body="No sessions match your current filters. Remove a filter or clear all to see more sessions."
					cta={
						<Pressable
							accessibilityRole="button"
							className="bg-secondary px-4 py-2 rounded-md"
							onPress={clearAll}
						>
							<Text>Clear filters</Text>
						</Pressable>
					}
				/>
			}
		/>
	);
}

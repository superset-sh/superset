import { Search } from "lucide-react-native";
import { useState } from "react";
import { Pressable } from "react-native";
import { EmptyState } from "@/components/EmptyState";
import { Text } from "@/components/ui/text";
import { SessionsList } from "../../components/SessionsList";
import { MOCK_PROJECT_NAME } from "../../mock-data";

export type SessionsListSearchNoMatchProps = {
	className?: string;
	initialQuery?: string;
};

/**
 * UC-NAV-06.4 — search query returns zero matches in the current project.
 * Multi-project chip header with the populated search input + visible clear
 * button. Body: oversized search icon + "No matches" + Clear search CTA.
 * No FAB.
 */
export function SessionsListSearchNoMatch({
	className,
	initialQuery = "zzzz",
}: SessionsListSearchNoMatchProps) {
	const [query, setQuery] = useState(initialQuery);
	return (
		<SessionsList
			className={className}
			projectName={MOCK_PROJECT_NAME}
			sessions={[]}
			showFab={false}
			headerProps={{
				variant: "multi-project",
				searchValue: query,
				onSearchChange: setQuery,
				onClearSearch: () => setQuery(""),
				onMenuPress: () => {},
				onProjectChipPress: () => {},
				onFilterPress: () => {},
			}}
			emptyBody={
				<EmptyState
					icon={Search}
					heading="No matches"
					body={`No sessions in ${MOCK_PROJECT_NAME} match "${query}".`}
					cta={
						<Pressable
							accessibilityRole="button"
							className="bg-secondary px-4 py-2 rounded-md"
							onPress={() => setQuery("")}
						>
							<Text>Clear search</Text>
						</Pressable>
					}
				/>
			}
		/>
	);
}

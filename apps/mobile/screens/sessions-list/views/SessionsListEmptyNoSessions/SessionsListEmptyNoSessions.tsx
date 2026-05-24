import { MessageSquare } from "lucide-react-native";
import { EmptyState } from "@/components/EmptyState";
import { SessionsList } from "../../components/SessionsList";
import { MOCK_PROJECT_NAME } from "../../mock-data";

export type SessionsListEmptyNoSessionsProps = {
	className?: string;
};

/**
 * UC-NAV-06.3 — multi-project but the active project has zero sessions yet.
 * Multi-project chip header is shown. FAB IS visible — the user can create
 * a session from this state.
 */
export function SessionsListEmptyNoSessions({
	className,
}: SessionsListEmptyNoSessionsProps) {
	return (
		<SessionsList
			className={className}
			projectName={MOCK_PROJECT_NAME}
			sessions={[]}
			showFab={true}
			headerProps={{
				variant: "multi-project",
				onMenuPress: () => {},
				onProjectChipPress: () => {},
				onFilterPress: () => {},
			}}
			emptyBody={
				<EmptyState
					icon={MessageSquare}
					heading={`Start your first chat in ${MOCK_PROJECT_NAME}`}
					body="Tap the + button below to begin a new conversation."
				/>
			}
			onNewChatPress={() => {}}
		/>
	);
}

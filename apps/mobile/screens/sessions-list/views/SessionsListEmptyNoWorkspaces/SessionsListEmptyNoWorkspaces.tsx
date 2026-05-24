import { Layers } from "lucide-react-native";
import { EmptyState } from "@/components/EmptyState";
import { SessionsList } from "../../components/SessionsList";
import { MOCK_PROJECT_NAME } from "../../mock-data";

export type SessionsListEmptyNoWorkspacesProps = {
	className?: string;
};

/**
 * UC-NAV-06.2 — exactly one project but zero workspaces. Header uses the
 * `single-project` chip variant (static, no chevron). No FAB.
 */
export function SessionsListEmptyNoWorkspaces({
	className,
}: SessionsListEmptyNoWorkspacesProps) {
	return (
		<SessionsList
			className={className}
			projectName={MOCK_PROJECT_NAME}
			sessions={[]}
			showFab={false}
			headerProps={{
				variant: "single-project",
				onMenuPress: () => {},
				onFilterPress: () => {},
			}}
			emptyBody={
				<EmptyState
					icon={Layers}
					heading={`No workspaces in ${MOCK_PROJECT_NAME}`}
					body="Create a workspace on desktop to start a new chat here. A workspace pairs a git branch with a host machine."
				/>
			}
		/>
	);
}

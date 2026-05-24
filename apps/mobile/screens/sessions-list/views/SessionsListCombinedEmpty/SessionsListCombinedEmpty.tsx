import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { SessionsListEmptyNoProjects } from "../SessionsListEmptyNoProjects";
import { SessionsListEmptyNoSessions } from "../SessionsListEmptyNoSessions";
import { SessionsListEmptyNoWorkspaces } from "../SessionsListEmptyNoWorkspaces";
import { SessionsListFiltersNoMatch } from "../SessionsListFiltersNoMatch";
import { SessionsListSearchNoMatch } from "../SessionsListSearchNoMatch";

export type SessionsListCombinedEmptyProps = {
	className?: string;
};

/**
 * Reference / contact sheet — all 5 sessions-list empty states stacked
 * vertically for design review. Each state is rendered at fractional height
 * inside a labeled section so reviewers can compare hierarchies side-by-side.
 */
export function SessionsListCombinedEmpty(_: SessionsListCombinedEmptyProps) {
	return (
		<View className="flex-1 bg-background">
			<Section label="06.1 · no projects">
				<SessionsListEmptyNoProjects />
			</Section>
			<Section label="06.2 · no workspaces">
				<SessionsListEmptyNoWorkspaces />
			</Section>
			<Section label="06.3 · no sessions">
				<SessionsListEmptyNoSessions />
			</Section>
			<Section label="06.4 · search no-match">
				<SessionsListSearchNoMatch />
			</Section>
			<Section label="06.5 · filters no-match">
				<SessionsListFiltersNoMatch />
			</Section>
		</View>
	);
}

function Section({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<View className="border-b-2 border-border" style={{ height: 600 }}>
			<View className="bg-secondary px-4 py-1">
				<Text
					variant="muted"
					className="text-xs font-mono uppercase tracking-wider"
				>
					{label}
				</Text>
			</View>
			<View className="flex-1">{children}</View>
		</View>
	);
}

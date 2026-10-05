import { useLocalSearchParams } from "expo-router";
import { WorkspaceScreen } from "@/screens/(authenticated)/workspace/[id]/WorkspaceScreen";

export default function WorkspaceRoute() {
	const { id } = useLocalSearchParams<{ id: string }>();
	return <WorkspaceScreen key={id} />;
}

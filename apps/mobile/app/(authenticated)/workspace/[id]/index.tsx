import { Redirect, useLocalSearchParams } from "expo-router";

export default function WorkspaceIndex() {
	const { id } = useLocalSearchParams<{ id: string }>();
	return <Redirect href={`/(authenticated)/workspace/${id}/chat`} />;
}

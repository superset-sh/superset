import { Stack } from "expo-router";

// Chat threads are the workspace's only surface — home lists workspaces with
// their sessions inline, so `index` just falls back to home.
export default function WorkspaceLayout() {
	return <Stack screenOptions={{ headerShown: false }} />;
}

import { Stack } from "expo-router";

// Chat is the workspace's primary surface, so we render its sections in a plain
// Stack rather than a floating Chat/Changes tab bar (which overlapped the chat
// composer). `index` redirects to `chat`; `changes` is reachable via navigation.
export default function WorkspaceLayout() {
	return <Stack screenOptions={{ headerShown: false }} />;
}

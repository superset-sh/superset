import { Redirect } from "expo-router";

// The workspace has no landing page of its own — home lists every workspace
// with its chat sessions inline, so a bare workspace link falls back to home.
export default function WorkspaceIndex() {
	return <Redirect href="/(authenticated)/(home)" />;
}

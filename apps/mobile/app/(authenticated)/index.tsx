import { Redirect } from "expo-router";

export default function AuthenticatedIndex() {
	return <Redirect href="/(authenticated)/(drawer)/workspaces" />;
}

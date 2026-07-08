import { Stack, useRouter } from "expo-router";

export function WorkspaceBackButton() {
	const router = useRouter();

	const exitWorkspace = () => {
		if (router.canGoBack()) {
			router.back();
			return;
		}
		router.replace("/(authenticated)/(home)");
	};

	return (
		<Stack.Toolbar placement="left">
			<Stack.Toolbar.Button icon="chevron.backward" onPress={exitWorkspace} />
		</Stack.Toolbar>
	);
}

import { createFileRoute } from "@tanstack/react-router";
import { MainScreen } from "renderer/screens/main";

export const Route = createFileRoute("/_authenticated/workspace/")({
	component: WorkspacePage,
});

function WorkspacePage() {
	return <MainScreen />;
}

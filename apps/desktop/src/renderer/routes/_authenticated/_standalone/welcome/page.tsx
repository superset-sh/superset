import { createFileRoute } from "@tanstack/react-router";
import { StartView } from "renderer/screens/main/components/StartView";

export const Route = createFileRoute("/_authenticated/_standalone/welcome/")({
	component: WelcomePage,
});

function WelcomePage() {
	return <StartView />;
}

import { createFileRoute } from "@tanstack/react-router";
import { LinearIntegrationSettings } from "./components/LinearIntegrationSettings";

export const Route = createFileRoute(
	"/_authenticated/settings/integrations/linear/",
)({
	component: LinearIntegrationSettingsPage,
});

function LinearIntegrationSettingsPage() {
	return <LinearIntegrationSettings />;
}

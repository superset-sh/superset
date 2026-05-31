import { createFileRoute } from "@tanstack/react-router";
import { ExperimentalSettings } from "./components/ExperimentalSettings";

export const Route = createFileRoute("/_authenticated/settings/experimental/")({
	component: ExperimentalSettingsPage,
});

function ExperimentalSettingsPage() {
	return <ExperimentalSettings />;
}

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings/appearance/")({
	component: AppearanceSettingsPage,
});

function AppearanceSettingsPage() {
	return (
		<div>
			<h2>Appearance Settings</h2>
			<p>Appearance settings placeholder</p>
		</div>
	);
}

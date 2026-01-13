import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings/presets/")({
	component: PresetsSettingsPage,
});

function PresetsSettingsPage() {
	return (
		<div>
			<h2>Presets Settings</h2>
			<p>Presets settings placeholder</p>
		</div>
	);
}

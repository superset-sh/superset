import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings/keyboard/")({
	component: KeyboardSettingsPage,
});

function KeyboardSettingsPage() {
	return (
		<div>
			<h2>Keyboard Settings</h2>
			<p>Keyboard settings placeholder</p>
		</div>
	);
}

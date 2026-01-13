import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings/behavior/")({
	component: BehaviorSettingsPage,
});

function BehaviorSettingsPage() {
	return (
		<div>
			<h2>Behavior Settings</h2>
			<p>Behavior settings placeholder</p>
		</div>
	);
}

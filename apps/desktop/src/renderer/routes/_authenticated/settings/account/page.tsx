import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings/account/")({
	component: AccountSettingsPage,
});

function AccountSettingsPage() {
	return (
		<div>
			<h2>Account Settings</h2>
			<p>Account settings placeholder</p>
		</div>
	);
}

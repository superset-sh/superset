import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings/links/")({
	beforeLoad: () => {
		throw redirect({ to: "/settings/files", replace: true });
	},
});

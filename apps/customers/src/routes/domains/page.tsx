import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy URL — the domain rollup is now the Companies page. */
export const Route = createFileRoute("/domains/")({
	beforeLoad: () => {
		throw redirect({ to: "/companies" });
	},
});

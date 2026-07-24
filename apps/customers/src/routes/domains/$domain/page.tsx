import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy URL — domain pages now live under /companies. */
export const Route = createFileRoute("/domains/$domain/")({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: "/companies/$domain",
			params: { domain: params.domain },
		});
	},
});

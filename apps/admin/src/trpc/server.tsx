import "server-only";

import type { AppRouter } from "@superset/trpc";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { headers } from "next/headers";
import { cache } from "react";
import SuperJSON from "superjson";

import { env } from "../env";

export const api = cache(async () => {
	const heads = new Headers(await headers());
	heads.set("x-trpc-source", "rsc");

	return createTRPCClient<AppRouter>({
		links: [
			httpBatchLink({
				transformer: SuperJSON,
				url: `${env.NEXT_PUBLIC_API_URL}/api/trpc`,
				headers() {
					return Object.fromEntries(heads.entries());
				},
			}),
		],
	});
});

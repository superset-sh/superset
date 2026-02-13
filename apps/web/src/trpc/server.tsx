import "server-only";

import { createServerTRPCClient } from "@superset/trpc/client/server";
import { headers } from "next/headers";
import { cache } from "react";

import { env } from "../env";

export const api = cache(async () => {
	const heads = new Headers(await headers());
	heads.set("x-trpc-source", "rsc");

	return createServerTRPCClient({
		apiUrl: env.NEXT_PUBLIC_API_URL,
		headers: heads,
	});
});

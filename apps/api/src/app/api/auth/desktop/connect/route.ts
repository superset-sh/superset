import { auth } from "@superset/auth/server";
import { NextResponse } from "next/server";

import { env } from "@/env";

export async function GET(request: Request) {
	const url = new URL(request.url);
	const provider = url.searchParams.get("provider");
	const state = url.searchParams.get("state");
	const protocol = url.searchParams.get("protocol");

	if (!provider || !state) {
		return new Response("Missing provider or state", { status: 400 });
	}

	if (provider !== "google" && provider !== "github") {
		return new Response("Invalid provider", { status: 400 });
	}

	const successUrl = new URL(`${env.NEXT_PUBLIC_WEB_URL}/auth/desktop/success`);
	successUrl.searchParams.set("desktop_state", state);
	if (protocol) {
		successUrl.searchParams.set("desktop_protocol", protocol);
	}

	const result = await auth.api.signInSocial({
		body: {
			provider,
			callbackURL: successUrl.toString(),
		},
		asResponse: true,
	});

	const cookies = result.headers.getSetCookie();
	const body = (await result.json()) as { url?: string; redirect?: boolean };

	if (!body.url) {
		return new Response(`Failed to initiate OAuth: ${JSON.stringify(body)}`, {
			status: 500,
		});
	}

	const response = NextResponse.redirect(body.url);
	for (const cookie of cookies) {
		response.headers.append("set-cookie", cookie);
	}

	return response;
}

import { auth } from "@superset/auth";
import { COMPANY } from "@superset/shared/constants";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { env } from "./env";

export default async function proxy() {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session?.user) {
		return NextResponse.redirect(new URL(env.NEXT_PUBLIC_WEB_URL));
	}

	if (!session.user.email.endsWith(COMPANY.EMAIL_DOMAIN)) {
		return NextResponse.redirect(new URL(env.NEXT_PUBLIC_WEB_URL));
	}

	return NextResponse.next();
}

export const config = {
	matcher: [
		"/((?!_next|ingest|monitoring|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
		"/(api|trpc)(.*)",
	],
};

import { NextResponse } from "next/server";
import { env } from "@/env";

const REFERRAL_COOKIE_NAME = "superset_referral";
const REFERRAL_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ code: string }> },
) {
	const { code } = await params;
	const safeCode = code.trim();

	const destination = new URL("/sign-up", env.NEXT_PUBLIC_WEB_URL);
	if (safeCode) {
		destination.searchParams.set("ref", safeCode);
	}

	const response = NextResponse.redirect(destination);

	if (safeCode) {
		response.cookies.set(REFERRAL_COOKIE_NAME, safeCode, {
			domain: resolveCookieDomain(env.NEXT_PUBLIC_WEB_URL),
			maxAge: REFERRAL_COOKIE_MAX_AGE_SECONDS,
			sameSite: "lax",
			secure: true,
			httpOnly: false,
			path: "/",
		});
	}

	return response;
}

function resolveCookieDomain(webUrl: string) {
	try {
		const host = new URL(webUrl).hostname;
		const parts = host.split(".");
		if (parts.length >= 2) {
			return `.${parts.slice(-2).join(".")}`;
		}
		return host;
	} catch {
		return undefined;
	}
}

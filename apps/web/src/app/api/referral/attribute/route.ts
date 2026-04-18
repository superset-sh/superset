import { attributeReferral } from "@superset/auth/referral";
import { auth } from "@superset/auth/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user) {
		return NextResponse.json(
			{ status: "rejected", reason: "unauthenticated" },
			{ status: 401 },
		);
	}

	let body: { code?: string };
	try {
		body = (await request.json()) as { code?: string };
	} catch {
		return NextResponse.json(
			{ status: "rejected", reason: "invalid-body" },
			{ status: 400 },
		);
	}

	const result = await attributeReferral({
		refereeUser: {
			id: session.user.id,
			createdAt: new Date(session.user.createdAt),
		},
		code: body.code,
	});

	return NextResponse.json(result);
}

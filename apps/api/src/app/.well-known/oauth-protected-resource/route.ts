import { env } from "@/env";

function getPublicOrigin(req: Request): string {
	const host = req.headers.get("x-forwarded-host") ?? new URL(req.url).host;
	const proto =
		req.headers.get("x-forwarded-proto") ??
		new URL(req.url).protocol.replace(":", "");
	return `${proto}://${host}`;
}

export function GET(req: Request) {
	return Response.json(
		{
			resource: getPublicOrigin(req),
			authorization_servers: [env.NEXT_PUBLIC_API_URL],
		},
		{
			headers: {
				"Access-Control-Allow-Origin": "*",
				"Cache-Control": "max-age=3600",
			},
		},
	);
}

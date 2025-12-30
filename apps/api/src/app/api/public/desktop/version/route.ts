import { env } from "@/env";

export function GET() {
	return Response.json({
		minimumSupportedVersion: env.DESKTOP_MINIMUM_SUPPORTED_VERSION ?? null,
	});
}

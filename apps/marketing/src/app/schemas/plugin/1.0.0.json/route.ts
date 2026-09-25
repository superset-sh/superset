import { COMPANY } from "@superset/shared/constants";
import { pluginManifestSchema } from "@superset/shared/plugins/manifest-schema";
import { z } from "zod";

export function GET() {
	const schema = {
		$schema: "https://json-schema.org/draft/2020-12/schema",
		$id: `${COMPANY.MARKETING_URL}/schemas/plugin/1.0.0.json`,
		...z.toJSONSchema(pluginManifestSchema, { io: "input" }),
	};

	return Response.json(schema, {
		headers: {
			"Content-Type": "application/schema+json",
			"Cache-Control": "public, max-age=3600, s-maxage=86400",
		},
	});
}

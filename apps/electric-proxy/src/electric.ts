import type { WhereClause } from "./auth";
import type { Env } from "./types";

const PROTOCOL_PARAMS = new Set([
	"live",
	"live_sse",
	"handle",
	"offset",
	"cursor",
	"expired_handle",
	"log",
	"subset__where",
	"subset__limit",
	"subset__offset",
	"subset__order_by",
	"subset__params",
	"subset__where_expr",
	"subset__order_by_expr",
	"cache-buster",
]);

const COLUMN_RESTRICTIONS: Record<string, string> = {
	"auth.apikeys": "id,name,start,created_at,last_request",
	integration_connections:
		"id,organization_id,connected_by_user_id,provider,token_expires_at,external_org_id,external_org_name,config,created_at,updated_at",
};

export function buildUpstreamUrl(
	clientUrl: URL,
	tableName: string,
	whereClause: WhereClause,
	env: Env,
): URL {
	const hasSourceCredentials =
		Boolean(env.ELECTRIC_SOURCE_ID) && Boolean(env.ELECTRIC_SOURCE_SECRET);

	const upstream = new URL(env.ELECTRIC_SHAPE_URL ?? "");

	if (hasSourceCredentials) {
		upstream.searchParams.set("source_id", env.ELECTRIC_SOURCE_ID ?? "");
		upstream.searchParams.set("secret", env.ELECTRIC_SOURCE_SECRET ?? "");
	} else {
		upstream.searchParams.set("secret", env.ELECTRIC_SECRET ?? "");
	}

	for (const [key, value] of clientUrl.searchParams) {
		if (PROTOCOL_PARAMS.has(key)) {
			upstream.searchParams.set(key, value);
		}
	}

	upstream.searchParams.set("table", tableName);
	upstream.searchParams.set("where", whereClause.fragment);
	for (let i = 0; i < whereClause.params.length; i++) {
		upstream.searchParams.set(
			`params[${i + 1}]`,
			String(whereClause.params[i]),
		);
	}

	const columns = COLUMN_RESTRICTIONS[tableName];
	if (columns) {
		upstream.searchParams.set("columns", columns);
	}
	return upstream;
}

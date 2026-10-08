import { CLIError, positional, string, table } from "@superset/cli-framework";
import {
	MAX_PAGE_STORAGE_KEY_LENGTH,
	type PageStorageReadback,
} from "@superset/shared/page-storage";
import { pageStorageRecordsPath } from "@superset/shared/page-storage-hub";
import { command } from "../../../lib/command";
import { getApiUrl } from "../../../lib/config";
import { env } from "../../../lib/env";
import { resolvePageId } from "../pageId";

export async function userJwt(
	bearer: string,
	fetchImpl: typeof fetch = fetch,
): Promise<string> {
	if (bearer.split(".").length === 3) return bearer;
	if (!bearer.startsWith("sk_live_")) {
		throw new CLIError(
			"Reading page storage needs a signed-in user",
			"Run: superset auth login, or pass --api-key",
		);
	}
	const response = await fetchImpl(`${getApiUrl()}/api/auth/token`, {
		headers: { "x-api-key": bearer },
	});
	if (!response.ok) {
		throw new CLIError(
			`Could not get a token for this API key (${response.status})`,
			"Check the key with: superset auth whoami",
		);
	}
	return ((await response.json()) as { token: string }).token;
}

export async function readStorage({
	realtimeUrl,
	jwt,
	pageId,
	key,
	fetchImpl = fetch,
}: {
	realtimeUrl: string;
	jwt: string;
	pageId: string;
	key?: string;
	fetchImpl?: typeof fetch;
}): Promise<PageStorageReadback> {
	const response = await fetchImpl(
		`${realtimeUrl}${pageStorageRecordsPath(pageId, key)}`,
		{ headers: { authorization: `Bearer ${jwt}` } },
	);
	if (response.ok) return (await response.json()) as PageStorageReadback;
	const error = (
		(await response.json().catch(() => null)) as { error?: string } | null
	)?.error;
	switch (response.status) {
		case 401:
			throw new CLIError(
				"Page storage did not accept your credentials",
				"Run: superset auth login",
			);
		case 403:
			throw new CLIError(
				error ?? "You cannot read this page's storage",
				"Only the creator can read a just_me page's storage; for other pages, members of the page's organization can",
			);
		case 404:
			throw new CLIError(
				"This page has no published version",
				"Publish it first: superset pages publish",
			);
		default:
			throw new CLIError(
				error ?? `Page storage refused the request (${response.status})`,
			);
	}
}

function printable(text: string): string {
	return text.replace(
		/\p{Cc}/gu,
		(char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
	);
}

export function displayStorage(data: PageStorageReadback): string {
	if ("keys" in data) {
		if (data.keys.length === 0) return "This page has no stored records.";
		return table(
			data.keys.map((row) => ({
				key: printable(row.key),
				records: row.records,
				updated: new Date(row.updatedAt).toLocaleString(),
			})),
			["key", "records", "updated"],
			["KEY", "RECORDS", "UPDATED"],
			[MAX_PAGE_STORAGE_KEY_LENGTH, 8, 24],
		);
	}
	if (data.records.length === 0) return `No records for key "${data.key}".`;
	return table(
		data.records.map((row) => ({
			name: printable(row.name),
			value: printable(JSON.stringify(row.value)),
			updated: new Date(row.updatedAt).toLocaleString(),
		})),
		["name", "value", "updated"],
		["NAME", "VALUE", "UPDATED"],
		[24, 60, 24],
	);
}

export default command({
	description: "Read a page's shared storage: keys, or every slot of one key",
	args: [positional("page").required().desc("Page id or slug")],
	options: {
		key: string().desc("Show every person's slot for this key"),
	},
	run: async ({ ctx, args, options }) => ({
		data: await readStorage({
			realtimeUrl: env.REALTIME_URL,
			jwt: await userJwt(ctx.bearer),
			pageId: await resolvePageId(ctx, args.page as string),
			key: options.key,
		}),
	}),
	display: (data) => displayStorage(data as PageStorageReadback),
});

const CONTENT_TIMEOUT_MS = 10_000;

/**
 * Fetch a published version's HTML from blob storage.
 *
 * The download URL is unguessable but not access-gated, so it is only ever
 * resolved server-side, after `page.pull` has authorized the read.
 */
export async function getPageContent({
	downloadUrl,
	slug,
	version,
}: {
	downloadUrl: string;
	slug: string;
	version: number;
}): Promise<string> {
	let response: Response;
	try {
		response = await fetch(downloadUrl, {
			cache: "no-store",
			signal: AbortSignal.timeout(CONTENT_TIMEOUT_MS),
		});
	} catch (error) {
		console.error("[pages] page content fetch failed", {
			slug,
			version,
			error,
		});
		throw new Error("Could not load this page's content", { cause: error });
	}

	if (!response.ok) {
		console.error("[pages] failed to fetch page content", {
			slug,
			version,
			status: response.status,
		});
		throw new Error(`Could not load this page's content (${response.status})`);
	}

	return await response.text();
}

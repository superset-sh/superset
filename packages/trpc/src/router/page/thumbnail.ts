import { db } from "@superset/db/client";
import { pages, pageVersions } from "@superset/db/schema";
import { pageThumbnailKey, pageViewUrl } from "@superset/shared/usercontent";
import { Client } from "@upstash/qstash";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../env";
import { objectExists, putObject } from "../../lib/r2";
import { mintPageTicket, writePageManifest } from "./storage";

export const PAGE_THUMBNAIL_JOB_PATH = "/api/pages/jobs/thumbnail";

export const pageThumbnailJobSchema = z.object({
	pageId: z.string().uuid(),
	version: z.number().int().positive(),
});

export type PageThumbnailJob = z.infer<typeof pageThumbnailJobSchema>;

const CAPTURE_WIDTH = 1280;
const CAPTURE_HEIGHT = 880;
const JPEG_QUALITY = 75;
const CAPTURE_TICKET_TTL_SECONDS = 5 * 60;

/**
 * Queues a capture of the version a page now serves. Best effort by design:
 * the page is fully published before this runs, and a missing thumbnail only
 * costs the grid a placeholder, so a queueing failure is logged, not thrown.
 */
export async function enqueuePageThumbnail(
	job: PageThumbnailJob,
): Promise<void> {
	if (!env.CLOUDFLARE_BROWSER_RENDERING_TOKEN) return;
	const url = `${env.NEXT_PUBLIC_API_URL}${PAGE_THUMBNAIL_JOB_PATH}`;
	const failed = (error: unknown) => {
		console.error("[pages] failed to queue thumbnail", { ...job, error });
	};

	// QStash cannot reach a local API, and the route skips signature checks in
	// development, so call it directly.
	if (env.NODE_ENV === "development") {
		void fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(job),
		}).catch(failed);
		return;
	}

	try {
		const qstash = new Client({ token: env.QSTASH_TOKEN });
		await qstash.publishJSON({
			url,
			body: job,
			retries: 3,
			deduplicationId: `page-thumbnail-${job.pageId}-${job.version}`,
		});
	} catch (error) {
		failed(error);
	}
}

export type PageThumbnailResult =
	| "generated"
	| "existing"
	| "superseded"
	| "missing";

/**
 * Captures the served version through the page's own origin — the same
 * bytes, headers and policy a reader gets — and stores the JPEG beside the
 * version. Only the version the grid shows is worth rendering: an agent that
 * republished five times since this was queued gets one capture, not five.
 */
export async function generatePageThumbnail({
	pageId,
	version,
}: PageThumbnailJob): Promise<PageThumbnailResult> {
	const token = env.CLOUDFLARE_BROWSER_RENDERING_TOKEN;
	if (!token) return "superseded";

	const [page] = await db
		.select()
		.from(pages)
		.where(eq(pages.id, pageId))
		.limit(1);
	if (!page) return "missing";

	const [latest] = await db
		.select({ version: pageVersions.version })
		.from(pageVersions)
		.where(eq(pageVersions.pageId, pageId))
		.orderBy(desc(pageVersions.version))
		.limit(1);
	if ((page.sharedVersion ?? latest?.version) !== version) return "superseded";

	// A version's capture is immutable, so re-pinning one already captured
	// costs nothing.
	const key = pageThumbnailKey(pageId, version);
	if (await objectExists(key)) return "existing";

	// Publish already wrote it; this repairs the rare failure so the capture
	// below never 404s on a page that exists.
	await writePageManifest(pageId);

	const url = pageViewUrl({
		baseUrl: env.USERCONTENT_URL,
		pageId,
		version,
		ticket: await mintPageTicket(page, {
			version,
			ttlSeconds: CAPTURE_TICKET_TTL_SECONDS,
		}),
	});

	const response = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/browser-rendering/screenshot?cacheTTL=0`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				url,
				viewport: { width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT },
				screenshotOptions: { type: "jpeg", quality: JPEG_QUALITY },
				gotoOptions: { waitUntil: "load", timeout: 15_000 },
				waitForTimeout: 500,
				bestAttempt: true,
				rejectResourceTypes: [
					"xhr",
					"fetch",
					"websocket",
					"eventsource",
					"ping",
				],
			}),
		},
	);
	if (!response.ok) {
		const detail = (await response.text()).slice(0, 300);
		throw new Error(
			`Browser Rendering screenshot failed (${response.status}): ${detail}`,
		);
	}

	await putObject({
		key,
		body: new Uint8Array(await response.arrayBuffer()),
		contentType: "image/jpeg",
		bucket: "private",
	});
	return "generated";
}

import {
	generatePageThumbnail,
	PAGE_THUMBNAIL_JOB_PATH,
	pageThumbnailJobSchema,
} from "@superset/trpc/page-thumbnail";
import { verifyQstashRequest } from "@/lib/verifyQstash";

export async function POST(request: Request) {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		PAGE_THUMBNAIL_JOB_PATH,
	);
	if (rejected) return rejected;

	let payload: unknown;
	try {
		payload = JSON.parse(body);
	} catch {
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}
	const parsed = pageThumbnailJobSchema.safeParse(payload);
	if (!parsed.success) {
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	const result = await generatePageThumbnail(parsed.data);
	return Response.json({ result });
}

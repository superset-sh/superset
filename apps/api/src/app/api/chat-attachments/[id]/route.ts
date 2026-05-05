import { auth } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { chatAttachments } from "@superset/db/schema";
import { head } from "@vercel/blob";
import { eq } from "drizzle-orm";

const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildContentDisposition(filename: string, mediaType: string): string {
	// Only image bytes can be safely rendered inline on the API origin.
	// HTML/XML/JSON would otherwise execute or be sniffed in the auth'd origin.
	const disposition = mediaType.startsWith("image/") ? "inline" : "attachment";
	// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control chars from a stored filename is the whole point.
	const ascii = filename.replace(/[\x00-\x1f\x7f"\\]/g, "").trim() || "file";
	const encoded = encodeURIComponent(ascii);
	return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
): Promise<Response> {
	const sessionData = await auth.api.getSession({ headers: request.headers });
	if (!sessionData?.user) {
		return new Response("Unauthorized", { status: 401 });
	}

	const { id } = await params;
	if (!UUID_REGEX.test(id)) {
		return new Response("Not found", { status: 404 });
	}

	const [attachment] = await db
		.select({
			blobPathname: chatAttachments.blobPathname,
			mediaType: chatAttachments.mediaType,
			filename: chatAttachments.filename,
			ownerId: chatAttachments.createdBy,
		})
		.from(chatAttachments)
		.where(eq(chatAttachments.id, id))
		.limit(1);

	if (!attachment || attachment.ownerId !== sessionData.user.id) {
		return new Response("Not found", { status: 404 });
	}

	let downloadUrl: string;
	try {
		const meta = await head(attachment.blobPathname);
		downloadUrl = meta.url;
	} catch (error) {
		console.error("[chat-attachments] head failed", { id, error });
		return new Response("Attachment not available", { status: 404 });
	}

	let blobResp: Response;
	try {
		blobResp = await fetch(downloadUrl);
	} catch (error) {
		console.error("[chat-attachments] blob fetch threw", { id, error });
		return new Response("Failed to fetch attachment", { status: 502 });
	}
	if (!blobResp.ok || !blobResp.body) {
		console.error("[chat-attachments] blob fetch failed", {
			id,
			status: blobResp.status,
		});
		return new Response("Failed to fetch attachment", { status: 502 });
	}

	return new Response(blobResp.body, {
		status: 200,
		headers: {
			"Content-Type": attachment.mediaType,
			"X-Content-Type-Options": "nosniff",
			"Content-Disposition": buildContentDisposition(
				attachment.filename,
				attachment.mediaType,
			),
			"Cache-Control": "private, max-age=3600",
		},
	});
}

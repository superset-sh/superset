import { auth } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { chatAttachments } from "@superset/db/schema";
import { head } from "@vercel/blob";
import { eq } from "drizzle-orm";

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
): Promise<Response> {
	const sessionData = await auth.api.getSession({ headers: request.headers });
	if (!sessionData?.user) {
		return new Response("Unauthorized", { status: 401 });
	}

	const { id } = await params;

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

	const blobResp = await fetch(downloadUrl);
	if (!blobResp.ok || !blobResp.body) {
		console.error("[chat-attachments] blob fetch failed", {
			id,
			status: blobResp.status,
		});
		return new Response("Failed to fetch attachment", { status: 502 });
	}

	const safeFilename = attachment.filename.replace(/"/g, "");
	return new Response(blobResp.body, {
		status: 200,
		headers: {
			"Content-Type": attachment.mediaType,
			"Content-Disposition": `inline; filename="${safeFilename}"`,
			"Cache-Control": "private, max-age=3600",
		},
	});
}

import { put } from "@vercel/blob";
import { requireAuth } from "../../lib";

const ALLOWED_MEDIA_TYPES = new Set([
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif",
	"application/pdf",
	"text/plain",
	"text/markdown",
	"text/csv",
	"text/html",
	"application/json",
	"application/xml",
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
	const session = await requireAuth(request);
	if (!session) return new Response("Unauthorized", { status: 401 });

	const { sessionId } = await params;

	const formData = await request.formData();
	const file = formData.get("file");

	if (!file || !(file instanceof File)) {
		return Response.json({ error: "file field is required" }, { status: 400 });
	}

	if (file.size > MAX_FILE_SIZE) {
		return Response.json(
			{
				error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
			},
			{ status: 400 },
		);
	}

	const mediaType = file.type || "application/octet-stream";
	if (!ALLOWED_MEDIA_TYPES.has(mediaType)) {
		return Response.json(
			{
				error: `Unsupported file type: ${mediaType}. Allowed types: ${[...ALLOWED_MEDIA_TYPES].join(", ")}`,
			},
			{ status: 400 },
		);
	}

	const ext = file.name.split(".").pop() ?? "bin";
	const randomId = crypto.randomUUID().slice(0, 8);
	const blobPath = `chat-attachments/${sessionId}/${randomId}.${ext}`;

	const blob = await put(blobPath, file, {
		access: "public",
		contentType: mediaType,
	});

	return Response.json(
		{
			url: blob.url,
			mediaType,
			filename: file.name,
		},
		{ status: 200 },
	);
}

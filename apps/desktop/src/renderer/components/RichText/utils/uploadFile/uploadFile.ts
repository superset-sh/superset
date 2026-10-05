import { apiTrpcClient } from "renderer/lib/api-trpc-client";

/** Sends a file to storage and returns a link the editor can show right away. */
export async function uploadFile(file: File): Promise<string> {
	const { fileId, upload } = await apiTrpcClient.attachment.createUpload.mutate(
		{
			name: file.name || "attachment",
			contentType: file.type || "application/octet-stream",
			sizeBytes: file.size,
		},
	);
	const response = await fetch(upload.url, {
		method: "PUT",
		headers: upload.headers,
		body: file,
	});
	if (!response.ok) throw new Error(`Upload failed (${response.status})`);
	const [resolved] = await apiTrpcClient.attachment.resolve.mutate({
		fileIds: [fileId],
	});
	if (!resolved) throw new Error("Upload failed");
	return resolved.url;
}

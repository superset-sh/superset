import type { FileUIPart } from "ai";
import { env } from "renderer/env.renderer";
import { getAuthToken } from "renderer/lib/auth-client";

const apiUrl = env.NEXT_PUBLIC_API_URL;

async function getHttpErrorDetail(response: Response): Promise<string> {
	const errorBody = await response
		.text()
		.then((text) => text.trim())
		.catch(() => "");
	const statusText = response.statusText ? ` ${response.statusText}` : "";
	const detail = errorBody ? ` - ${errorBody.slice(0, 500)}` : "";
	return `${response.status}${statusText}${detail}`;
}

async function uploadFile(
	sessionId: string,
	file: FileUIPart,
	signal?: AbortSignal,
): Promise<FileUIPart> {
	const response = await fetch(file.url, { signal });
	if (!response.ok) {
		const detail = await getHttpErrorDetail(response);
		throw new Error(`Failed to fetch attachment ${file.url}: ${detail}`);
	}
	const blob = await response.blob();
	const filename = file.filename || "attachment";

	const formData = new FormData();
	formData.append("file", new File([blob], filename, { type: file.mediaType }));

	const token = getAuthToken();
	const res = await fetch(`${apiUrl}/api/chat/${sessionId}/attachments`, {
		method: "POST",
		signal,
		headers: token ? { Authorization: `Bearer ${token}` } : {},
		body: formData,
	});

	if (!res.ok) {
		const detail = await getHttpErrorDetail(res);
		throw new Error(`Upload failed for session ${sessionId}: ${detail}`);
	}

	const result: { url: string; mediaType: string; filename?: string } =
		await res.json();
	return { type: "file", ...result };
}

export async function uploadFiles(
	sessionId: string,
	files: FileUIPart[],
	signal?: AbortSignal,
): Promise<FileUIPart[]> {
	if (files.length === 0) return [];
	return Promise.all(files.map((file) => uploadFile(sessionId, file, signal)));
}

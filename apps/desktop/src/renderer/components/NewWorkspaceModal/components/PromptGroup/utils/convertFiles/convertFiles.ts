export type ConvertedFile = {
	data: string;
	mediaType: string;
	filename?: string;
};

export async function convertBlobUrlToDataUrl(url: string): Promise<string> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to fetch attachment: ${response.statusText}`);
	}
	const blob = await response.blob();
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => resolve(reader.result as string);
		reader.onerror = () => reject(new Error("Failed to read attachment data"));
		reader.onabort = () => reject(new Error("Attachment read was aborted"));
		reader.readAsDataURL(blob);
	});
}

export async function convertPromptInputFiles(
	files: Array<{ url: string; mediaType: string; filename?: string }>,
): Promise<ConvertedFile[]> {
	return Promise.all(
		files.map(async (file) => ({
			data: file.url.startsWith("data:")
				? file.url
				: await convertBlobUrlToDataUrl(file.url),
			mediaType: file.mediaType,
			filename: file.filename,
		})),
	);
}

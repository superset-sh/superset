export function toMastraImages(
	files: Array<{ url: string; mediaType: string }> | undefined,
): Array<{ data: string; mimeType: string }> {
	if (!files || files.length === 0) return [];

	const images: Array<{ data: string; mimeType: string }> = [];
	for (const file of files) {
		if (!file.url.startsWith("data:")) continue;
		const commaIndex = file.url.indexOf(",");
		if (commaIndex <= 0) continue;
		const header = file.url.slice(0, commaIndex);
		const data = file.url.slice(commaIndex + 1);
		if (!header.includes(";base64")) continue;
		if (!data) continue;
		images.push({
			data,
			mimeType: file.mediaType,
		});
	}

	return images;
}

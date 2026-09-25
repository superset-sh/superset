/** Read a File into base64 (handles binary + large files via the reader). */
export function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result;
			if (typeof result !== "string") {
				reject(new Error("Unexpected file reader result"));
				return;
			}
			// Strip the "data:<mime>;base64," prefix.
			const comma = result.indexOf(",");
			resolve(comma >= 0 ? result.slice(comma + 1) : result);
		};
		reader.onerror = () =>
			reject(reader.error ?? new Error("Failed to read file"));
		reader.readAsDataURL(file);
	});
}

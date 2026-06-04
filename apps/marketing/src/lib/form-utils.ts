export function validateEmail(email: string): boolean {
	const parts = email.split("@");
	return (
		parts.length === 2 &&
		parts[0] !== undefined &&
		parts[0].length > 0 &&
		parts[1] !== undefined &&
		parts[1].length > 0 &&
		parts[1].includes(".")
	);
}

export function sanitizeSingleLine(input: string): string {
	return input.replace(/[\r\n\0]/g, "").trim();
}

export function sanitizeMessage(input: string): string {
	return input.replace(/\0/g, "").trim();
}

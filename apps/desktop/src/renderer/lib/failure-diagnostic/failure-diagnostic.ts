export function failureDiagnostic(error: unknown): string {
	try {
		if (error instanceof Error) {
			const message = error.message;
			if (typeof message === "string") return message;
		}
		if (typeof error === "string") return error;
		const serialized = JSON.stringify(error);
		if (serialized !== undefined) return serialized;
	} catch {}
	try {
		return String(error);
	} catch {
		return "[Unprintable error]";
	}
}

export function getErrorMessage(error: unknown): string | null {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	if (error) return "Unexpected chat error";
	return null;
}

export function isUniqueViolation(error: unknown, constraint: string): boolean {
	for (
		let current: unknown = error, depth = 0;
		current !== null && typeof current === "object" && depth < 8;
		current = (current as { cause?: unknown }).cause, depth += 1
	) {
		const candidate = current as { code?: string; constraint?: string };
		if (candidate.code === "23505" && candidate.constraint === constraint) {
			return true;
		}
	}
	return false;
}

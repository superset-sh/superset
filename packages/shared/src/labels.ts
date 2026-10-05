export const LABEL_NAME_MAX_LENGTH = 64;
export const LABELS_MAX_PER_WORKSPACE = 32;

export function normalizeLabelName(name: string): string | null {
	const normalized = name.trim().toLowerCase();
	if (normalized.length === 0 || normalized.length > LABEL_NAME_MAX_LENGTH) {
		return null;
	}
	return normalized;
}

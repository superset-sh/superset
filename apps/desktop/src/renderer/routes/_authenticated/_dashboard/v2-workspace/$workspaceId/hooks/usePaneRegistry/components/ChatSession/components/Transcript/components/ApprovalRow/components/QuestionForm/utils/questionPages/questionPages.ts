import type { FormField } from "@superset/chat/protocol";

export type FormValues = Record<string, string | string[]>;

export type QuestionPage = {
	field: FormField;
	other?: FormField;
};

export function questionPages(fields: readonly FormField[]): QuestionPage[] {
	const pages: QuestionPage[] = [];
	for (const field of fields) {
		const previous = pages.at(-1);
		if (previous && field.id === `${previous.field.id}_custom`) {
			previous.other = field;
			continue;
		}
		pages.push({ field });
	}
	return pages;
}

export function answerText(value: string | string[] | undefined): string {
	if (Array.isArray(value)) return value.join(", ");
	return value?.trim() ?? "";
}

export function isInvalidNumber(
	field: FormField,
	value: string | string[] | undefined,
): boolean {
	if (field.input !== "number" && field.input !== "integer") return false;
	const text = answerText(value);
	if (text === "") return false;
	const parsed = Number(text);
	return (
		!Number.isFinite(parsed) ||
		(field.input === "integer" && !Number.isInteger(parsed))
	);
}

export function isPageAnswered(
	page: QuestionPage,
	values: FormValues,
): boolean {
	return (
		answerText(values[page.field.id]) !== "" ||
		(page.other !== undefined && answerText(values[page.other.id]) !== "")
	);
}

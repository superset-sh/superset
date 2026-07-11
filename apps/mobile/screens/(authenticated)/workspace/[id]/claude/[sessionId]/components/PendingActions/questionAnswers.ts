interface QuestionKey {
	question: string;
}

/** Combines selected and custom AskUserQuestion values without duplicates. */
export function buildQuestionAnswers(
	questions: QuestionKey[],
	selected: Record<string, string[]>,
	custom: Record<string, string>,
): Record<string, string> {
	return Object.fromEntries(
		questions.map((question) => {
			const values = [
				...(selected[question.question] ?? []),
				custom[question.question] ?? "",
			];
			const seen = new Set<string>();
			const unique = values.filter((value) => {
				const normalized = value.trim().toLocaleLowerCase();
				if (!normalized || seen.has(normalized)) return false;
				seen.add(normalized);
				return true;
			});
			return [
				question.question,
				unique.map((value) => value.trim()).join(", "),
			];
		}),
	);
}

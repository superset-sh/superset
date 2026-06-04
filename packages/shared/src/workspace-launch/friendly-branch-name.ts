import friendlyWords from "friendly-words";

/**
 * Generates a friendly two-word branch name like "cheerful-umbrella".
 * Uses the friendly-words word bag (predicate + object).
 */
export function generateFriendlyBranchName(): string {
	const predicates = friendlyWords.predicates as string[];
	const objects = friendlyWords.objects as string[];
	const predicate = predicates[Math.floor(Math.random() * predicates.length)];
	const object = objects[Math.floor(Math.random() * objects.length)];
	return `${predicate}-${object}`;
}

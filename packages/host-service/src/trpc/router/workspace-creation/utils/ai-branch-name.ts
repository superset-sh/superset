import { generateTitleFromMessage } from "@superset/chat-legacy/server/desktop";
import { getSmallModel } from "@superset/chat-legacy/server/shared";
import { deduplicateBranchName } from "./sanitize-branch";

const BRANCH_NAME_INSTRUCTIONS =
	"Generate a concise git branch name (2-4 words, kebab-case, descriptive, 20 characters or less). Return ONLY the branch name, nothing else.";

const MAX_BRANCH_LENGTH = 100;
const GENERATE_TIMEOUT_MS = 5_000;
// A real branch name is 2-4 words. An LLM that ignored the instruction and
// answered conversationally ("I'd be happy to help you implement that task,
// but I don't have access to…") produces far more — see #5288.
const MAX_BRANCH_WORDS = 8;

/** Words that carry no branch-naming signal (copied from the renderer's
 * slugifier conventions). */
const STOP_WORDS = new Set([
	"a",
	"an",
	"the",
	"this",
	"that",
	"with",
	"for",
	"from",
	"and",
	"or",
	"but",
	"in",
	"on",
	"of",
	"to",
	"please",
	"can",
	"could",
	"would",
	"should",
	"implement",
	"implementation",
]);

/**
 * Light sanitizer for AI-generated branch names — lowercase, kebab-case,
 * restricted character set. Differs from desktop's full sanitizer: no
 * multi-segment support (AI generates a single segment) and no preserve-case
 * options.
 */
function sanitizeGeneratedBranchName(raw: string): string {
	return raw
		.toLowerCase()
		.trim()
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9._+@-]/g, "")
		.replace(/\.{2,}/g, ".")
		.replace(/-+/g, "-")
		.replace(/\.lock$/g, "")
		.slice(0, MAX_BRANCH_LENGTH)
		.replace(/^[-.]+|[-.]+$/g, "");
}

function wordCount(name: string): number {
	if (!name) return 0;
	return name.split("-").filter(Boolean).length;
}

/**
 * True when the generated string plausibly is a branch name rather than a
 * conversational reply. The model is instructed to return ONLY a branch
 * name, but prompts that include a URL (e.g. a Jira task link) reliably
 * produce "I'd be happy to help you implement that task, but I don't have
 * access to…" — a long sentence that sanitizes into a long kebab string
 * with many segments. Treat anything beyond MAX_BRANCH_WORDS segments as
 * a miss and fall back to a prompt-derived slug (#5288).
 */
export function isPlausibleBranchName(candidate: string): boolean {
	return wordCount(candidate) <= MAX_BRANCH_WORDS;
}

/**
 * Derive a branch name from the prompt itself, used when the model's reply
 * is not a plausible branch name. Strips URLs, keeps the first few
 * meaningful words, kebab-cases them.
 */
export function slugifyPrompt(prompt: string): string {
	const withoutUrls = prompt.replace(/https?:\/\/\S+/g, " ");
	const words = withoutUrls
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.split(/\s+/)
		.filter((w) => w.length > 0 && !STOP_WORDS.has(w));
	// Run the result through the same sanitizer as generated names so the
	// 100-char branch limit applies to fallback slugs too (#6238).
	const slug = sanitizeGeneratedBranchName(words.slice(0, 4).join("-"));
	return slug || "workspace";
}

export async function generateBranchNameFromPrompt(
	prompt: string,
	existingBranches: string[],
): Promise<string | null> {
	const model = await getSmallModel();
	if (!model) return null;

	let generated: string | null;
	try {
		generated = await Promise.race([
			generateTitleFromMessage({
				message: prompt,
				agentModel: model,
				agentId: "branch-namer",
				agentName: "Branch Namer",
				instructions: BRANCH_NAME_INSTRUCTIONS,
				tracingContext: { surface: "host-service-branch-name" },
			}),
			new Promise<never>((_, reject) =>
				setTimeout(
					() => reject(new Error(`timed out after ${GENERATE_TIMEOUT_MS}ms`)),
					GENERATE_TIMEOUT_MS,
				),
			),
		]);
	} catch (error) {
		console.warn("[generateBranchNameFromPrompt] generation failed:", error);
		return null;
	}

	if (!generated) return null;
	const sanitized = sanitizeGeneratedBranchName(generated);
	// A conversational reply or un-sanitizable output ("...", emoji-only)
	// is not a branch name — fall back to a slug of the prompt so the
	// workspace/branch gets a sensible, deterministic name (and the same
	// prompt shape no longer yields the identical name for different URLs,
	// which the deduplicator then can't separate).
	const branchName =
		!sanitized || !isPlausibleBranchName(sanitized)
			? slugifyPrompt(prompt)
			: sanitized;
	if (!branchName) return null;
	return deduplicateBranchName(branchName, existingBranches);
}

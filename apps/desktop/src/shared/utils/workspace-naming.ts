import { sanitizeBranchNameWithMaxLength, sanitizeSegment } from "./branch";

export const DEFAULT_WORKSPACE_TITLE_MAX_LENGTH = 100;
export const DEFAULT_PROMPT_BRANCH_MAX_LENGTH = 30;
const MIN_BRANCH_WORD_COUNT = 2;
const MAX_BRANCH_WORD_COUNT = 3;

const PROMPT_STOPWORDS = new Set([
	"a",
	"an",
	"and",
	"are",
	"as",
	"at",
	"can",
	"could",
	"de",
	"del",
	"do",
	"for",
	"from",
	"how",
	"i",
	"in",
	"is",
	"la",
	"las",
	"los",
	"me",
	"mi",
	"my",
	"need",
	"of",
	"on",
	"please",
	"por",
	"para",
	"quiero",
	"que",
	"se",
	"should",
	"the",
	"this",
	"to",
	"un",
	"una",
	"we",
	"with",
	"would",
	"you",
]);

const PROMPT_TRANSLATIONS: Record<string, string> = {
	agregar: "add",
	anadir: "add",
	anade: "add",
	arreglar: "fix",
	arreglo: "fix",
	auth: "auth",
	autenticacion: "auth",
	bug: "bug",
	cambiar: "update",
	clave: "key",
	componente: "component",
	componentes: "components",
	configuracion: "config",
	corregir: "fix",
	crear: "create",
	cuenta: "account",
	dashboard: "dashboard",
	documentacion: "docs",
	error: "error",
	errores: "errors",
	flujo: "flow",
	inicio: "login",
	implementa: "implement",
	implementar: "implement",
	login: "login",
	mejorar: "improve",
	mejora: "improve",
	movil: "mobile",
	pagina: "page",
	pago: "billing",
	pagos: "billing",
	panel: "dashboard",
	pantalla: "screen",
	perfil: "profile",
	prueba: "test",
	pruebas: "tests",
	repo: "repo",
	repositorio: "repo",
	sesion: "session",
	suscripcion: "subscription",
	tests: "tests",
	usuario: "user",
	usuarios: "users",
	web: "web",
};

const ALWAYS_KEEP_SHORT_TOKENS = new Set([
	"ai",
	"api",
	"ci",
	"cli",
	"db",
	"dx",
	"id",
	"ios",
	"pr",
	"qa",
	"seo",
	"sso",
	"ui",
	"ux",
]);

function normalizePromptWords(prompt: string): string[] {
	return prompt
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.split(/[^a-z0-9]+/g)
		.filter(Boolean);
}

function toBranchKeywords(prompt: string): string[] {
	const keywords: string[] = [];
	const seen = new Set<string>();

	for (const rawWord of normalizePromptWords(prompt)) {
		const translated = PROMPT_TRANSLATIONS[rawWord] ?? rawWord;
		if (PROMPT_STOPWORDS.has(translated)) {
			continue;
		}

		if (translated.length < 2 && !ALWAYS_KEEP_SHORT_TOKENS.has(translated)) {
			continue;
		}

		const sanitized = sanitizeSegment(translated, DEFAULT_PROMPT_BRANCH_MAX_LENGTH);
		if (!sanitized || seen.has(sanitized)) {
			continue;
		}

		seen.add(sanitized);
		keywords.push(sanitized);
	}

	return keywords;
}

/**
 * Normalized workspace title (for display/storage), derived from a free-form prompt.
 * This does not mutate the actual agent prompt.
 */
export function deriveWorkspaceTitleFromPrompt(
	prompt: string,
	maxLength = DEFAULT_WORKSPACE_TITLE_MAX_LENGTH,
): string {
	return prompt.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/**
 * Generates a branch slug from prompt text and applies branch naming constraints.
 */
export function deriveWorkspaceBranchFromPrompt(
	prompt: string,
	segmentMaxLength = DEFAULT_PROMPT_BRANCH_MAX_LENGTH,
): string {
	const allKeywords = toBranchKeywords(prompt);
	if (allKeywords.length === 0) {
		return "";
	}

	const keywords = [...allKeywords];
	if (keywords.length < MIN_BRANCH_WORD_COUNT) {
		keywords.unshift("update");
	}

	const selectedKeywords: string[] = [];
	for (const keyword of keywords) {
		if (selectedKeywords.length >= MAX_BRANCH_WORD_COUNT) {
			break;
		}

		const candidate = [...selectedKeywords, keyword].join("-");
		if (candidate.length > segmentMaxLength) {
			if (selectedKeywords.length >= MIN_BRANCH_WORD_COUNT) {
				break;
			}
			continue;
		}

		selectedKeywords.push(keyword);
	}

	if (selectedKeywords.length === 0) {
		selectedKeywords.push(keywords[0].slice(0, segmentMaxLength));
	}

	if (selectedKeywords.length < MIN_BRANCH_WORD_COUNT && keywords.length > 1) {
		const remainingLength = Math.max(
			0,
			segmentMaxLength - selectedKeywords.join("-").length - 1,
		);
		if (remainingLength > 0) {
			selectedKeywords.push(keywords[1].slice(0, remainingLength));
		}
	}

	const generatedSlug = selectedKeywords
		.slice(0, MAX_BRANCH_WORD_COUNT)
		.join("-");
	return sanitizeBranchNameWithMaxLength(generatedSlug, segmentMaxLength);
}

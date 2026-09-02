import { i18n } from "@superset/i18n";
import type { Command, CommandSection } from "./types";

const TITLE_EXACT = 100;
const TITLE_PREFIX = 90;
const TITLE_WORD_PREFIX = 80;
const TITLE_ALL_TOKENS = 70;
const TITLE_SUBSTRING = 60;
const KEYWORD_PREFIX = 50;
const ALL_TOKENS = 40;

type Searchable = Pick<Command, "title" | "keywords">;

function normalize(text: string): string {
	return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function words(text: string): string[] {
	return text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function hasWordPrefix(wordList: string[], prefix: string): boolean {
	return wordList.some((word) => word.startsWith(prefix));
}

/**
 * 0 means no match. Matches are contiguous (whole query or whole query
 * tokens at word starts), never character subsequences: "po" must not hit
 * "Toggle theme" via "ap-p-earance col-o-r". Ties keep provider order.
 */
export function scoreCommand(command: Searchable, rawQuery: string): number {
	const query = normalize(rawQuery);
	if (!query) return 1;

	const title = normalize(i18n._(command.title));
	if (title === query) return TITLE_EXACT;
	if (title.startsWith(query)) return TITLE_PREFIX;

	const titleWords = words(title);
	if (hasWordPrefix(titleWords, query)) return TITLE_WORD_PREFIX;

	const tokens = words(query);
	if (
		tokens.length > 0 &&
		tokens.every((token) => hasWordPrefix(titleWords, token))
	) {
		return TITLE_ALL_TOKENS;
	}

	if (title.includes(query)) return TITLE_SUBSTRING;

	const keywords = (command.keywords ?? []).map(normalize);
	if (
		keywords.some(
			(keyword) =>
				keyword.startsWith(query) || hasWordPrefix(words(keyword), query),
		)
	) {
		return KEYWORD_PREFIX;
	}

	const allWords = [...titleWords, ...keywords.flatMap(words)];
	if (
		tokens.length > 0 &&
		tokens.every((token) => hasWordPrefix(allWords, token))
	) {
		return ALL_TOKENS;
	}

	return 0;
}

interface Scored<T> {
	command: T;
	score: number;
}

function scoreAll<T extends Searchable>(
	commands: T[],
	query: string,
): Scored<T>[] {
	return commands
		.map((command) => ({ command, score: scoreCommand(command, query) }))
		.filter((entry) => entry.score > 0)
		.sort((a, b) => b.score - a.score);
}

export function rankCommands<T extends Searchable>(
	commands: T[],
	query: string,
): T[] {
	if (!normalize(query)) return commands;
	return scoreAll(commands, query).map((entry) => entry.command);
}

/** Drops empty sections and orders the rest by their best hit. */
export function rankSections(
	sections: CommandSection[],
	query: string,
): CommandSection[] {
	if (!normalize(query)) return sections;
	return sections
		.flatMap((section) => {
			const scored = scoreAll(section.commands, query);
			if (scored.length === 0) return [];
			return [
				{
					section: {
						...section,
						commands: scored.map((entry) => entry.command),
					},
					best: scored[0].score,
				},
			];
		})
		.sort((a, b) => b.best - a.best)
		.map((entry) => entry.section);
}

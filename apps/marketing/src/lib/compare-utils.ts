/**
 * Pure utility functions and types for the comparison page system.
 * These can be safely imported in both server and client components.
 */

import { formatContentDate } from "./content-utils";

export type ComparisonPageType = "1v1" | "roundup" | "tutorial";

export interface ComparisonPage {
	slug: string;
	url: string;
	title: string;
	description: string;
	date: string;
	lastUpdated?: string;
	type: ComparisonPageType;
	competitors: string[];
	keywords: string[];
	image?: string;
	content: string;
}

export interface ComparisonFaqItem {
	question: string;
	answer: string;
}

export function formatCompareDate(date: string): string {
	return formatContentDate(date, "short");
}

export function getComparisonPageTypeLabel(type: ComparisonPageType): string {
	switch (type) {
		case "roundup":
			return "Roundup";
		case "tutorial":
			return "Tutorial";
		default:
			return "Comparison";
	}
}

function stripMarkdownFormatting(value: string): string {
	return value
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/[*_~>#]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

export function extractComparisonFaqItems(
	content: string,
): ComparisonFaqItem[] {
	const lines = content.split("\n");
	const items: ComparisonFaqItem[] = [];

	let inFaqSection = false;
	let currentQuestion: string | undefined;
	let currentAnswerLines: string[] = [];

	const flushItem = () => {
		if (!currentQuestion) {
			currentAnswerLines = [];
			return;
		}

		const answer = stripMarkdownFormatting(currentAnswerLines.join(" "));
		if (!answer) {
			currentQuestion = undefined;
			currentAnswerLines = [];
			return;
		}

		items.push({
			question: stripMarkdownFormatting(currentQuestion),
			answer,
		});

		currentQuestion = undefined;
		currentAnswerLines = [];
	};

	for (const line of lines) {
		const trimmedLine = line.trim();

		if (/^##\s+(Frequently Asked Questions|FAQ)\s*$/i.test(trimmedLine)) {
			inFaqSection = true;
			continue;
		}

		if (!inFaqSection) {
			continue;
		}

		if (/^##\s+/.test(trimmedLine)) {
			flushItem();
			break;
		}

		const questionMatch = trimmedLine.match(/^###\s+(.+)$/);
		if (questionMatch) {
			flushItem();
			currentQuestion = questionMatch[1];
			continue;
		}

		if (currentQuestion) {
			currentAnswerLines.push(trimmedLine);
		}
	}

	flushItem();

	return items;
}

/**
 * Extracts the ranked list of tools from the first Markdown table in a roundup,
 * reading the first column of each data row. Used to emit ItemList structured
 * data so "best X" listicles are eligible for rich results.
 */
export function extractRoundupItems(content: string): string[] {
	const lines = content.split("\n");
	const items: string[] = [];

	let inTable = false;
	let seenSeparator = false;

	for (const line of lines) {
		const trimmed = line.trim();
		const isTableRow = trimmed.startsWith("|") && trimmed.endsWith("|");

		if (!inTable) {
			if (isTableRow) {
				inTable = true;
				seenSeparator = false;
			}
			continue;
		}

		if (!isTableRow) {
			break; // table ended
		}

		// The row after the header is the |---|---| separator.
		if (!seenSeparator) {
			if (/^\|[\s:|-]+\|$/.test(trimmed)) {
				seenSeparator = true;
			}
			continue; // skip header and separator rows
		}

		const firstCell = trimmed.slice(1, trimmed.indexOf("|", 1));
		const name = stripMarkdownFormatting(firstCell);
		if (name) {
			items.push(name);
		}
	}

	return items;
}

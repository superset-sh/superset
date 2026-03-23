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

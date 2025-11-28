import { useCallback, useEffect, useMemo, useState } from "react";
import type { BundledLanguage, Highlighter, ThemeRegistration } from "shiki";
import { useTheme } from "../stores/theme";
import { createShikiTheme } from "../stores/theme/utils";

/**
 * Languages to preload for common file types
 */
const PRELOAD_LANGUAGES: BundledLanguage[] = [
	"typescript",
	"tsx",
	"javascript",
	"jsx",
	"json",
	"markdown",
	"css",
	"html",
];

/**
 * Module-level singleton for the highlighter instance
 */
let highlighterInstance: Highlighter | null = null;
let highlighterPromise: Promise<Highlighter> | null = null;
let currentThemeJson = "";

/**
 * Cache for highlighted lines
 * Key format: `${themeId}:${lang}:${content}`
 */
const lineCache = new Map<string, string>();
const MAX_CACHE_SIZE = 10000;

function getCacheKey(themeId: string, lang: string, content: string): string {
	return `${themeId}:${lang}:${content}`;
}

function getCachedHighlight(key: string): string | undefined {
	return lineCache.get(key);
}

function setCachedHighlight(key: string, html: string): void {
	if (lineCache.size >= MAX_CACHE_SIZE) {
		// Evict oldest entries (first 1000)
		const keys = Array.from(lineCache.keys()).slice(0, 1000);
		for (const k of keys) {
			lineCache.delete(k);
		}
	}
	lineCache.set(key, html);
}

/**
 * Escape HTML entities
 */
function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

/**
 * Hook for syntax highlighting using Shiki
 *
 * Provides a `highlightLine` function that returns highlighted HTML for a single line of code.
 * The highlighter is lazily initialized and shared across all components.
 */
export function useHighlighter() {
	const theme = useTheme();
	const [highlighter, setHighlighter] = useState<Highlighter | null>(
		highlighterInstance,
	);
	const [isLoading, setIsLoading] = useState(!highlighterInstance);
	const [error, setError] = useState<Error | null>(null);

	// Create Shiki theme from current app theme
	const shikiTheme = useMemo((): ThemeRegistration | null => {
		if (!theme) return null;
		return createShikiTheme(
			theme.terminal,
			theme.type === "dark",
		) as ThemeRegistration;
	}, [theme]);

	const themeId = theme?.id || "default";

	// Initialize or update highlighter when theme changes
	useEffect(() => {
		if (!shikiTheme) return;

		const themeJson = JSON.stringify(shikiTheme);

		const initOrUpdate = async () => {
			try {
				// Dynamically import shiki to enable code splitting
				const { createHighlighter } = await import("shiki");

				// Initialize highlighter if needed
				if (!highlighterPromise) {
					setIsLoading(true);
					highlighterPromise = createHighlighter({
						themes: [shikiTheme],
						langs: PRELOAD_LANGUAGES,
					});
					highlighterInstance = await highlighterPromise;
					currentThemeJson = themeJson;
				} else if (currentThemeJson !== themeJson) {
					// Theme changed, load the new theme
					const hl = await highlighterPromise;
					await hl.loadTheme(shikiTheme);
					currentThemeJson = themeJson;
					// Clear cache when theme changes
					lineCache.clear();
				}

				setHighlighter(highlighterInstance);
				setError(null);
			} catch (err) {
				console.error("Failed to initialize highlighter:", err);
				setError(err instanceof Error ? err : new Error(String(err)));
			} finally {
				setIsLoading(false);
			}
		};

		initOrUpdate();
	}, [shikiTheme]);

	/**
	 * Highlight a single line of code
	 * Returns HTML string with syntax highlighting
	 */
	const highlightLine = useCallback(
		(content: string, language: string): string => {
			// Return escaped plain text if highlighter not ready
			if (!highlighter) {
				return escapeHtml(content);
			}

			// Check cache first
			const cacheKey = getCacheKey(themeId, language, content);
			const cached = getCachedHighlight(cacheKey);
			if (cached) {
				return cached;
			}

			try {
				// Use codeToTokens for line-level highlighting
				const tokens = highlighter.codeToTokens(content, {
					lang: language as BundledLanguage,
					theme: "superset-dynamic",
				});

				// Convert tokens to HTML
				const html =
					tokens.tokens[0]
						?.map(
							(token) =>
								`<span style="color:${token.color}">${escapeHtml(token.content)}</span>`,
						)
						.join("") || escapeHtml(content);

				// Cache the result
				setCachedHighlight(cacheKey, html);

				return html;
			} catch {
				// Fallback for unsupported languages
				return escapeHtml(content);
			}
		},
		[highlighter, themeId],
	);

	/**
	 * Load an additional language on demand
	 */
	const loadLanguage = useCallback(
		async (lang: BundledLanguage) => {
			if (!highlighter) return;

			try {
				const loadedLangs = highlighter.getLoadedLanguages();
				if (!loadedLangs.includes(lang)) {
					await highlighter.loadLanguage(lang);
				}
			} catch (err) {
				console.warn(`Failed to load language: ${lang}`, err);
			}
		},
		[highlighter],
	);

	return {
		highlightLine,
		loadLanguage,
		isLoading,
		error,
		isReady: !!highlighter && !isLoading,
	};
}

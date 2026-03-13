import { StreamLanguage, type StreamParser } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import {
	graphqlStreamLanguage,
	makefileStreamLanguage,
} from "./streamLanguages";

async function loadLegacyLanguage(
	loader: () => Promise<Record<string, unknown>>,
	key: string,
): Promise<Extension> {
	const languageModule = await loader();
	return StreamLanguage.define(languageModule[key] as StreamParser<unknown>);
}

export async function loadLanguageSupport(
	language: string,
): Promise<Extension | null> {
	switch (language) {
		case "typescript":
		case "javascript": {
			const { javascript } = await import("@codemirror/lang-javascript");
			return javascript({
				typescript: language === "typescript",
				jsx: true,
			});
		}
		case "json": {
			const { json } = await import("@codemirror/lang-json");
			return json();
		}
		case "html": {
			const { html } = await import("@codemirror/lang-html");
			return html();
		}
		case "css":
		case "scss":
		case "less": {
			const { css } = await import("@codemirror/lang-css");
			return css();
		}
		case "markdown": {
			const { markdown } = await import("@codemirror/lang-markdown");
			return markdown();
		}
		case "graphql":
			return StreamLanguage.define(graphqlStreamLanguage);
		case "plaintext":
			return null;
		case "yaml": {
			const { yaml } = await import("@codemirror/lang-yaml");
			return yaml();
		}
		case "xml": {
			const { xml } = await import("@codemirror/lang-xml");
			return xml();
		}
		case "python": {
			const { python } = await import("@codemirror/lang-python");
			return python();
		}
		case "rust": {
			const { rust } = await import("@codemirror/lang-rust");
			return rust();
		}
		case "sql": {
			const { sql } = await import("@codemirror/lang-sql");
			return sql();
		}
		case "php": {
			const { php } = await import("@codemirror/lang-php");
			return php();
		}
		case "java": {
			const { java } = await import("@codemirror/lang-java");
			return java();
		}
		case "c":
		case "cpp": {
			const { cpp } = await import("@codemirror/lang-cpp");
			return cpp();
		}
		case "go": {
			const { go } = await import("@codemirror/lang-go");
			return go();
		}
		case "shell":
			return loadLegacyLanguage(
				() => import("@codemirror/legacy-modes/mode/shell"),
				"shell",
			);
		case "dockerfile":
			return loadLegacyLanguage(
				() => import("@codemirror/legacy-modes/mode/dockerfile"),
				"dockerFile",
			);
		case "makefile":
			return StreamLanguage.define(makefileStreamLanguage);
		case "toml":
			return loadLegacyLanguage(
				() => import("@codemirror/legacy-modes/mode/toml"),
				"toml",
			);
		case "ruby":
			return loadLegacyLanguage(
				() => import("@codemirror/legacy-modes/mode/ruby"),
				"ruby",
			);
		case "swift":
			return loadLegacyLanguage(
				() => import("@codemirror/legacy-modes/mode/swift"),
				"swift",
			);
		case "csharp":
			return loadLegacyLanguage(
				() => import("@codemirror/legacy-modes/mode/clike"),
				"csharp",
			);
		case "kotlin":
			return loadLegacyLanguage(
				() => import("@codemirror/legacy-modes/mode/clike"),
				"kotlin",
			);
		default:
			return null;
	}
}

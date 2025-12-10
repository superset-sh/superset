import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import type React from "react";
import { useEffect } from "react";
import { useMonacoTheme } from "renderer/stores/theme";

self.MonacoEnvironment = {
	getWorker(_: unknown, label: string) {
		if (label === "json") {
			return new jsonWorker();
		}
		if (label === "css" || label === "scss" || label === "less") {
			return new cssWorker();
		}
		if (label === "html" || label === "handlebars" || label === "razor") {
			return new htmlWorker();
		}
		if (label === "typescript" || label === "javascript") {
			return new tsWorker();
		}
		return new editorWorker();
	},
};

loader.config({ monaco });

const SUPERSET_THEME = "superset-theme";

let monacoInitialized = false;

async function initializeMonaco(): Promise<typeof monaco> {
	if (monacoInitialized) {
		return monaco;
	}

	await loader.init();
	monacoInitialized = true;
	return monaco;
}

const monacoPromise = initializeMonaco();

interface MonacoProviderProps {
	children: React.ReactNode;
}

export function MonacoProvider({ children }: MonacoProviderProps) {
	const monacoTheme = useMonacoTheme();

	useEffect(() => {
		if (!monacoTheme) return;

		monacoPromise.then((monacoInstance) => {
			monacoInstance.editor.defineTheme(SUPERSET_THEME, monacoTheme);
		});
	}, [monacoTheme]);

	return <>{children}</>;
}

export { monaco, SUPERSET_THEME };

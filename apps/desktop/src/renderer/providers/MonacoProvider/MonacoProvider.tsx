import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import type React from "react";
import { createContext, useContext, useEffect, useState } from "react";
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

	// Note: Disable all diagnostics (lint errors, type errors, etc.) since it's a diff viewer
	monaco.typescript.typescriptDefaults.setDiagnosticsOptions({
		noSemanticValidation: true,
		noSyntaxValidation: true,
	});
	monaco.typescript.javascriptDefaults.setDiagnosticsOptions({
		noSemanticValidation: true,
		noSyntaxValidation: true,
	});

	monacoInitialized = true;
	return monaco;
}

const monacoPromise = initializeMonaco();

interface MonacoContextValue {
	isReady: boolean;
}

const MonacoContext = createContext<MonacoContextValue>({ isReady: false });

export function useMonacoReady(): boolean {
	return useContext(MonacoContext).isReady;
}

interface MonacoProviderProps {
	children: React.ReactNode;
}

export function MonacoProvider({ children }: MonacoProviderProps) {
	const monacoTheme = useMonacoTheme();
	const [isReady, setIsReady] = useState(false);

	useEffect(() => {
		if (isReady) return;
		if (!monacoTheme) return;

		let cancelled = false;

		monacoPromise.then((monacoInstance) => {
			if (cancelled) return;
			monacoInstance.editor.defineTheme(SUPERSET_THEME, monacoTheme);
			setIsReady(true);
		});

		return () => {
			cancelled = true;
		};
	}, [isReady, monacoTheme]);

	useEffect(() => {
		if (!isReady || !monacoTheme) return;

		monaco.editor.defineTheme(SUPERSET_THEME, monacoTheme);
	}, [isReady, monacoTheme]);

	return (
		<MonacoContext.Provider value={{ isReady }}>
			{children}
		</MonacoContext.Provider>
	);
}

export const MONACO_EDITOR_OPTIONS = {
	minimap: { enabled: false },
	scrollBeyondLastLine: false,
	wordWrap: "on" as const,
	fontSize: 13,
	lineHeight: 20,
	lineNumbersMinChars: 3,
	fontFamily:
		"ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace",
	padding: { top: 8, bottom: 8 },
	scrollbar: {
		verticalScrollbarSize: 8,
		horizontalScrollbarSize: 8,
	},
	renderLineHighlight: "none" as const,
	folding: false,
	guides: {
		indentation: false,
		bracketPairs: false,
		highlightActiveIndentation: false,
	},
};

export function registerSaveAction(
	editor: monaco.editor.IStandaloneCodeEditor,
	onSave: () => void,
) {
	editor.addAction({
		id: "save-file",
		label: "Save File",
		keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
		run: onSave,
	});
}

export { monaco, SUPERSET_THEME };

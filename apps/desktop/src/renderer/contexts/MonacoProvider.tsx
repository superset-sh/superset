import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import type React from "react";
import { useEffect, useRef } from "react";
import { useMonacoTheme } from "renderer/stores/theme";

// Configure Monaco environment for Electron (web workers)
self.MonacoEnvironment = {
	getWorker(_: unknown, _label: string) {
		return new editorWorker();
	},
};

// Configure Monaco to use the locally installed package
loader.config({ monaco });

// Custom theme name
const SUPERSET_THEME = "superset-theme";

// Track if Monaco has been initialized
let monacoInitialized = false;

/**
 * Initialize Monaco and preload it.
 * Call this early to avoid loading delay when DiffViewer mounts.
 */
async function initializeMonaco(): Promise<typeof monaco> {
	if (monacoInitialized) {
		return monaco;
	}

	// Preload Monaco by calling loader.init()
	await loader.init();
	monacoInitialized = true;

	return monaco;
}

// Start initialization immediately when this module loads
const monacoPromise = initializeMonaco();

interface MonacoProviderProps {
	children: React.ReactNode;
}

/**
 * Provider that initializes Monaco early and keeps the theme in sync.
 * Place this high in the component tree to ensure Monaco is ready
 * before any editors are rendered.
 */
export function MonacoProvider({ children }: MonacoProviderProps) {
	const monacoTheme = useMonacoTheme();
	const themeRegisteredRef = useRef(false);

	// Register theme with Monaco when it changes
	useEffect(() => {
		if (!monacoTheme) return;

		// Ensure Monaco is initialized before registering theme
		monacoPromise.then(() => {
			monaco.editor.defineTheme(SUPERSET_THEME, monacoTheme);
			themeRegisteredRef.current = true;
		});
	}, [monacoTheme]);

	return <>{children}</>;
}

/**
 * Get the Monaco theme name to use.
 * Returns the custom theme name if registered, otherwise falls back to vs-dark.
 */
export function getMonacoThemeName(): string {
	return monacoInitialized ? SUPERSET_THEME : "vs-dark";
}

/**
 * Check if Monaco has been initialized.
 */
export function isMonacoReady(): boolean {
	return monacoInitialized;
}

// Export the monaco instance for direct access if needed
export { monaco, SUPERSET_THEME };

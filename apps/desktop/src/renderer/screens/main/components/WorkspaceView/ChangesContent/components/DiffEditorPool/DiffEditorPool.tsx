import type * as Monaco from "monaco-editor";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	MONACO_EDITOR_OPTIONS,
	monaco,
	SUPERSET_THEME,
	useMonacoReady,
} from "renderer/providers/MonacoProvider";
import type { DiffViewMode, FileContents } from "shared/changes-types";

const POOL_SIZE = 3;

interface PooledEditor {
	id: number;
	editor: Monaco.editor.IStandaloneDiffEditor;
	container: HTMLDivElement;
	inUse: boolean;
	assignedTo: string | null;
}

interface DiffEditorPoolContextValue {
	acquireEditor: (
		key: string,
		targetContainer: HTMLDivElement,
		contents: FileContents,
		options: { viewMode: DiffViewMode; hideUnchangedRegions: boolean },
	) => PooledEditor | null;
	releaseEditor: (key: string) => void;
	updateOptions: (options: {
		viewMode: DiffViewMode;
		hideUnchangedRegions: boolean;
	}) => void;
}

const DiffEditorPoolContext = createContext<DiffEditorPoolContextValue | null>(
	null,
);

export function DiffEditorPoolProvider({ children }: { children: ReactNode }) {
	const isMonacoReady = useMonacoReady();
	const poolRef = useRef<PooledEditor[]>([]);
	const [isPoolReady, setIsPoolReady] = useState(false);

	// Initialize pool when Monaco is ready
	useEffect(() => {
		if (!isMonacoReady || poolRef.current.length > 0) return;

		const pool: PooledEditor[] = [];

		for (let i = 0; i < POOL_SIZE; i++) {
			const container = document.createElement("div");
			container.style.width = "100%";
			container.style.height = "100%";

			const editor = monaco.editor.createDiffEditor(container, {
				...MONACO_EDITOR_OPTIONS,
				theme: SUPERSET_THEME,
				automaticLayout: true,
				renderSideBySide: true,
				useInlineViewWhenSpaceIsLimited: false,
				readOnly: true,
				originalEditable: false,
				renderOverviewRuler: false,
				renderGutterMenu: false,
				diffWordWrap: "on",
				scrollbar: {
					handleMouseWheel: false,
					vertical: "hidden",
					horizontal: "hidden",
				},
				scrollBeyondLastLine: false,
			});

			pool.push({
				id: i,
				editor,
				container,
				inUse: false,
				assignedTo: null,
			});
		}

		poolRef.current = pool;
		setIsPoolReady(true);

		return () => {
			for (const pooled of pool) {
				pooled.editor.dispose();
			}
			poolRef.current = [];
		};
	}, [isMonacoReady]);

	const acquireEditor = useCallback(
		(
			key: string,
			targetContainer: HTMLDivElement,
			contents: FileContents,
			options: { viewMode: DiffViewMode; hideUnchangedRegions: boolean },
		): PooledEditor | null => {
			if (!isPoolReady) return null;

			// Check if already assigned to this key
			const existing = poolRef.current.find((p) => p.assignedTo === key);
			if (existing) {
				return existing;
			}

			// Try to get available editor
			const available = poolRef.current.find((p) => !p.inUse);
			if (available) {
				available.inUse = true;
				available.assignedTo = key;

				// Dispose old models if any
				const oldModel = available.editor.getModel();
				if (oldModel) {
					oldModel.original?.dispose();
					oldModel.modified?.dispose();
				}

				// Set new models
				const originalModel = monaco.editor.createModel(
					contents.original,
					contents.language,
				);
				const modifiedModel = monaco.editor.createModel(
					contents.modified,
					contents.language,
				);

				available.editor.setModel({
					original: originalModel,
					modified: modifiedModel,
				});

				available.editor.updateOptions({
					renderSideBySide: options.viewMode === "side-by-side",
					hideUnchangedRegions: { enabled: options.hideUnchangedRegions },
				});

				// Move container to target
				targetContainer.appendChild(available.container);

				// Trigger layout after DOM update
				requestAnimationFrame(() => {
					available.editor.layout();
				});

				return available;
			}

			// No available editor - will need to wait or steal
			return null;
		},
		[isPoolReady],
	);

	const releaseEditor = useCallback((key: string) => {
		const pooled = poolRef.current.find((p) => p.assignedTo === key);
		if (!pooled) return;

		// Remove from DOM
		if (pooled.container.parentNode) {
			pooled.container.parentNode.removeChild(pooled.container);
		}

		// Dispose models to free memory
		const model = pooled.editor.getModel();
		if (model) {
			model.original?.dispose();
			model.modified?.dispose();
		}

		pooled.inUse = false;
		pooled.assignedTo = null;
	}, []);

	const updateOptions = useCallback(
		(options: { viewMode: DiffViewMode; hideUnchangedRegions: boolean }) => {
			for (const pooled of poolRef.current) {
				if (pooled.inUse) {
					pooled.editor.updateOptions({
						renderSideBySide: options.viewMode === "side-by-side",
						hideUnchangedRegions: { enabled: options.hideUnchangedRegions },
					});
				}
			}
		},
		[],
	);

	const value = useMemo(
		() => ({ acquireEditor, releaseEditor, updateOptions }),
		[acquireEditor, releaseEditor, updateOptions],
	);

	return (
		<DiffEditorPoolContext.Provider value={value}>
			{children}
		</DiffEditorPoolContext.Provider>
	);
}

export function useDiffEditorPool() {
	return useContext(DiffEditorPoolContext);
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { workspaceTrpc } from "../../workspace-trpc";
import { useWorkspaceFsEvents } from "../useWorkspaceFsEvents";

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const BINARY_CHECK_SIZE = 8192;

export interface UseFileDocumentParams {
	workspaceId: string;
	absolutePath: string;
	mode?: "auto" | "text" | "bytes";
	maxBytes?: number;
	hasLocalChanges?: boolean;
	autoReloadWhenClean?: boolean;
}

export interface UseFileDocumentResult {
	absolutePath: string;
	state:
		| { kind: "loading" }
		| { kind: "not-found" }
		| { kind: "binary" }
		| { kind: "too-large" }
		| { kind: "text"; content: string; revision: string }
		| { kind: "bytes"; content: Uint8Array; revision: string };
	save: (input: {
		content: string | Uint8Array;
		force?: boolean;
	}) => Promise<
		| { status: "saved"; revision: string }
		| { status: "conflict"; currentContent: string | null }
		| { status: "not-found" }
		| { status: "exists" }
	>;
	reload: () => Promise<void>;
	hasExternalChange: boolean;
	conflict: { diskContent: string | null } | null;
}

function isBinaryText(content: string): boolean {
	const checkLength = Math.min(content.length, BINARY_CHECK_SIZE);
	for (let index = 0; index < checkLength; index += 1) {
		if (content.charCodeAt(index) === 0) {
			return true;
		}
	}

	return false;
}

function encodeBase64(content: Uint8Array): string {
	if (typeof Buffer !== "undefined") {
		return Buffer.from(content).toString("base64");
	}

	let binary = "";
	for (const byte of content) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

function decodeBase64(content: string): Uint8Array {
	if (typeof Buffer !== "undefined") {
		return new Uint8Array(Buffer.from(content, "base64"));
	}

	const binary = atob(content);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}

export function useFileDocument({
	workspaceId,
	absolutePath,
	mode = "auto",
	maxBytes = DEFAULT_MAX_BYTES,
	hasLocalChanges = false,
	autoReloadWhenClean = true,
}: UseFileDocumentParams): UseFileDocumentResult {
	const utils = workspaceTrpc.useUtils();
	const [currentPath, setCurrentPath] = useState(absolutePath);
	const [hasExternalChange, setHasExternalChange] = useState(false);
	const [conflict, setConflict] = useState<{
		diskContent: string | null;
	} | null>(null);
	const currentPathRef = useRef(currentPath);
	currentPathRef.current = currentPath;
	const hasLocalChangesRef = useRef(hasLocalChanges);
	hasLocalChangesRef.current = hasLocalChanges;

	useEffect(() => {
		setCurrentPath(absolutePath);
		setHasExternalChange(false);
		setConflict(null);
	}, [absolutePath]);

	const readFileQuery = workspaceTrpc.filesystem.readFile.useQuery(
		{
			workspaceId,
			absolutePath: currentPath,
			encoding: mode === "bytes" ? undefined : "utf-8",
			maxBytes,
		},
		{
			enabled: Boolean(workspaceId && currentPath),
			retry: false,
			refetchOnWindowFocus: false,
		},
	);

	const revision = useMemo(() => {
		if (!readFileQuery.data) {
			return null;
		}

		return readFileQuery.data.revision;
	}, [readFileQuery.data]);

	const reload = useCallback(async (): Promise<void> => {
		setHasExternalChange(false);
		setConflict(null);
		await readFileQuery.refetch();
	}, [readFileQuery]);

	const fetchCurrentDiskContent = useCallback(async (): Promise<
		string | null
	> => {
		try {
			const result = await utils.filesystem.readFile.fetch({
				workspaceId,
				absolutePath: currentPathRef.current,
				encoding: "utf-8",
				maxBytes,
			});

			if (
				result.kind !== "text" ||
				result.exceededLimit ||
				isBinaryText(result.content)
			) {
				return null;
			}

			return result.content;
		} catch {
			return null;
		}
	}, [maxBytes, utils.filesystem.readFile, workspaceId]);

	const markExternalChange = useCallback(async (): Promise<void> => {
		setHasExternalChange(true);
		if (mode === "bytes") {
			setConflict({ diskContent: null });
			return;
		}

		const diskContent = await fetchCurrentDiskContent();
		setConflict({ diskContent });
	}, [fetchCurrentDiskContent, mode]);

	useWorkspaceFsEvents(
		workspaceId,
		(event) => {
			const path = currentPathRef.current;
			if (!path) {
				return;
			}

			if (event.kind === "overflow") {
				if (hasLocalChangesRef.current) {
					void markExternalChange();
					return;
				}

				if (autoReloadWhenClean) {
					void reload();
				}
				return;
			}

			if (event.kind === "rename" && event.oldAbsolutePath === path) {
				setCurrentPath(event.absolutePath);
				if (hasLocalChangesRef.current) {
					void markExternalChange();
					return;
				}
				if (autoReloadWhenClean) {
					setHasExternalChange(false);
					setConflict(null);
				}
				return;
			}

			if (event.absolutePath !== path) {
				return;
			}

			if (hasLocalChangesRef.current) {
				void markExternalChange();
				return;
			}

			if (autoReloadWhenClean) {
				void reload();
			}
		},
		Boolean(workspaceId && currentPath),
	);

	const saveMutation = workspaceTrpc.filesystem.writeFile.useMutation();

	const save = useCallback(
		async (input: { content: string | Uint8Array; force?: boolean }) => {
			const content =
				typeof input.content === "string"
					? input.content
					: {
							kind: "base64" as const,
							data: encodeBase64(input.content),
						};

			const result = await saveMutation.mutateAsync({
				workspaceId,
				absolutePath: currentPathRef.current,
				content,
				encoding: typeof input.content === "string" ? "utf-8" : undefined,
				precondition:
					input.force || !revision
						? undefined
						: {
								ifMatch: revision,
							},
			});

			if (!result.ok) {
				if (result.reason === "conflict") {
					const currentContent = await fetchCurrentDiskContent();
					setHasExternalChange(true);
					setConflict({ diskContent: currentContent });
					return {
						status: "conflict" as const,
						currentContent,
					};
				}

				return {
					status: result.reason,
				} as const;
			}

			setHasExternalChange(false);
			setConflict(null);
			await utils.filesystem.readFile.invalidate({
				workspaceId,
				absolutePath: currentPathRef.current,
			});
			await readFileQuery.refetch();
			return {
				status: "saved" as const,
				revision: result.revision,
			};
		},
		[
			fetchCurrentDiskContent,
			readFileQuery,
			revision,
			saveMutation,
			utils.filesystem.readFile,
			workspaceId,
		],
	);

	const state = useMemo<UseFileDocumentResult["state"]>(() => {
		if (readFileQuery.error) {
			return { kind: "not-found" };
		}

		if (readFileQuery.isPending || !readFileQuery.data) {
			return { kind: "loading" };
		}

		if (readFileQuery.data.exceededLimit) {
			return { kind: "too-large" };
		}

		if (mode === "bytes" || readFileQuery.data.kind === "bytes") {
			const bytes =
				typeof readFileQuery.data.content === "string"
					? decodeBase64(readFileQuery.data.content)
					: readFileQuery.data.content;
			return {
				kind: "bytes",
				content: bytes,
				revision: readFileQuery.data.revision,
			};
		}

		const textContent = readFileQuery.data.content;
		if (mode === "auto" && isBinaryText(textContent)) {
			return { kind: "binary" };
		}

		return {
			kind: "text",
			content: textContent,
			revision: readFileQuery.data.revision,
		};
	}, [mode, readFileQuery.data, readFileQuery.error, readFileQuery.isPending]);

	return {
		absolutePath: currentPath,
		state,
		save,
		reload,
		hasExternalChange,
		conflict,
	};
}

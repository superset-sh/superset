import { toast } from "@superset/ui/sonner";
import { useCallback, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import stripAnsi from "strip-ansi";

export interface UseClipboardImagePasteOptions {
	workspaceId: string;
	isRemote: boolean;
	/** Write raw data to the terminal (used to send \x16 after upload). */
	onWrite: (data: string) => void;
}

type PasteMode = "ctrlv" | "path";

interface PendingImagePaste {
	remotePath: string;
	mode: PasteMode;
	timeoutId: ReturnType<typeof setTimeout> | null;
}

const CLAUDE_CLIPBOARD_MISS_PATTERNS = [
	"no image found in clipboard",
	"you are ssh'd; try scp?",
	"you're ssh'd; try scp?",
];

function hasClaudeClipboardMiss(text: string): boolean {
	const normalized = stripAnsi(text).toLowerCase();
	return CLAUDE_CLIPBOARD_MISS_PATTERNS.some((pattern) =>
		normalized.includes(pattern),
	);
}

function quoteForShellInput(path: string): string {
	return `"${path.replace(/(["\\])/g, "\\$1")}"`;
}

/**
 * Hook that handles image paste events for remote terminals.
 *
 * When the clipboard contains an image (and no text), this hook:
 * 1. Uploads the image to the remote host via SFTP
 * 2. Sends Ctrl+V (\x16) to the terminal so TUI apps trigger their clipboard read
 * 3. Clipboard proxy scripts on the remote serve the uploaded image
 */
export function useClipboardImagePaste({
	workspaceId,
	isRemote,
	onWrite,
}: UseClipboardImagePasteOptions) {
	const uploadMutation =
		electronTrpc.terminal.uploadClipboardImage.useMutation();
	const pendingPasteRef = useRef<PendingImagePaste | null>(null);

	const arrayBufferToBase64 = useCallback((buffer: ArrayBuffer): string => {
		const bytes = new Uint8Array(buffer);
		let binary = "";
		const chunkSize = 0x8000;
		for (let i = 0; i < bytes.length; i += chunkSize) {
			const chunk = bytes.subarray(i, i + chunkSize);
			binary += String.fromCharCode(...chunk);
		}
		return btoa(binary);
	}, []);

	const normalizeToPng = useCallback(
		async (
			file: File,
		): Promise<{ base64: string; mimeType: string; sizeBytes: number }> => {
			if (file.type === "image/png") {
				const original = await file.arrayBuffer();
				return {
					base64: arrayBufferToBase64(original),
					mimeType: "image/png",
					sizeBytes: original.byteLength,
				};
			}

			const inputBuffer = await file.arrayBuffer();
			const inputBlob = new Blob([inputBuffer], {
				type: file.type || "application/octet-stream",
			});
			const bitmap = await createImageBitmap(inputBlob);

			try {
				const canvas = document.createElement("canvas");
				canvas.width = bitmap.width;
				canvas.height = bitmap.height;
				const ctx = canvas.getContext("2d");
				if (!ctx) {
					throw new Error(
						"Failed to create canvas context for image conversion",
					);
				}

				ctx.drawImage(bitmap, 0, 0);

				const pngBlob = await new Promise<Blob>((resolve, reject) => {
					canvas.toBlob((blob) => {
						if (blob) {
							resolve(blob);
							return;
						}
						reject(new Error("Failed to convert pasted image to PNG"));
					}, "image/png");
				});

				const pngBuffer = await pngBlob.arrayBuffer();
				return {
					base64: arrayBufferToBase64(pngBuffer),
					mimeType: "image/png",
					sizeBytes: pngBuffer.byteLength,
				};
			} finally {
				bitmap.close();
			}
		},
		[arrayBufferToBase64],
	);

	const onImagePaste = useCallback(
		async (file: File): Promise<boolean> => {
			if (!isRemote) return false;

			const existingPending = pendingPasteRef.current;
			if (existingPending?.timeoutId) {
				clearTimeout(existingPending.timeoutId);
			}
			pendingPasteRef.current = null;

			const toastId = toast.loading("Uploading image to remote...", {
				description: `${(file.size / 1024).toFixed(0)} KB`,
			});

			try {
				const { base64, mimeType, sizeBytes } = await normalizeToPng(file);

				const result = await uploadMutation.mutateAsync({
					workspaceId,
					imageData: base64,
					mimeType,
				});

				const timeoutId = setTimeout(() => {
					const pending = pendingPasteRef.current;
					if (!pending) return;
					if (pending.remotePath !== result.remotePath) return;
					pendingPasteRef.current = null;
				}, 8000);

				pendingPasteRef.current = {
					remotePath: result.remotePath,
					mode: "ctrlv",
					timeoutId,
				};

				toast.success("Image uploaded to remote clipboard", {
					id: toastId,
					description: `${(sizeBytes / 1024).toFixed(0)} KB (PNG)`,
					duration: 2000,
				});

				if (result.verification && !result.verification.ok) {
					toast.warning("Remote clipboard proxy check failed", {
						description: result.verification.details.slice(0, 3).join(" | "),
						duration: 5000,
					});
				}

				// Send Ctrl+V (\x16) to the terminal so the TUI app triggers
				// its own clipboard read — our proxy scripts will serve the image.
				onWrite("\x16");

				return true;
			} catch (error) {
				toast.error("Failed to upload image", {
					id: toastId,
					description: error instanceof Error ? error.message : "Unknown error",
				});
				return false;
			}
		},
		[workspaceId, isRemote, onWrite, uploadMutation, normalizeToPng],
	);

	const onTerminalData = useCallback(
		(data: string): void => {
			const pending = pendingPasteRef.current;
			if (!pending) return;

			if (!hasClaudeClipboardMiss(data)) return;

			if (pending.mode === "ctrlv") {
				pending.mode = "path";
				onWrite(`${quoteForShellInput(pending.remotePath)} `);
				toast.info("Remote clipboard fallback applied", {
					description: "Pasted remote image path after clipboard miss",
					duration: 3000,
				});
				return;
			}

			if (pending.timeoutId) {
				clearTimeout(pending.timeoutId);
			}
			pendingPasteRef.current = null;
			toast.error("Image attach still failed", {
				description: `Use ${pending.remotePath} manually or scp to remote host.`,
				duration: 6000,
			});
		},
		[onWrite],
	);

	const onImagePasteRef = useRef(onImagePaste);
	onImagePasteRef.current = onImagePaste;
	const onTerminalDataRef = useRef(onTerminalData);
	onTerminalDataRef.current = onTerminalData;

	return { onImagePasteRef, onTerminalDataRef };
}

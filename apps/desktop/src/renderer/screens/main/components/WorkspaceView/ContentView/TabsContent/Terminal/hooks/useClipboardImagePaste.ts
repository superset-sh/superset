import { toast } from "@superset/ui/sonner";
import { useCallback, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

export interface UseClipboardImagePasteOptions {
	workspaceId: string;
	isRemote: boolean;
	/** Write raw data to the terminal (used to send \x16 after upload). */
	onWrite: (data: string) => void;
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

	const onImagePaste = useCallback(
		async (file: File): Promise<boolean> => {
			if (!isRemote) return false;

			const toastId = toast.loading("Uploading image to remote...", {
				description: `${(file.size / 1024).toFixed(0)} KB`,
			});

			try {
				const arrayBuffer = await file.arrayBuffer();
				const bytes = new Uint8Array(arrayBuffer);
				let binary = "";
				for (let i = 0; i < bytes.length; i++) {
					binary += String.fromCharCode(bytes[i]);
				}
				const base64 = btoa(binary);

				await uploadMutation.mutateAsync({
					workspaceId,
					imageData: base64,
					mimeType: file.type || "image/png",
				});

				toast.success("Image uploaded to remote clipboard", {
					id: toastId,
					duration: 2000,
				});

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
		[workspaceId, isRemote, onWrite, uploadMutation],
	);

	const onImagePasteRef = useRef(onImagePaste);
	onImagePasteRef.current = onImagePaste;

	return { onImagePasteRef };
}

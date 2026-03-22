import { useCallback, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

/**
 * Copy text to clipboard via Electron's native clipboard API (IPC).
 *
 * Unlike `navigator.clipboard.writeText`, this works regardless of
 * document focus — no DOMException when a terminal or webview has focus.
 *
 * Returns `{ copyToClipboard, copied }` where `copied` is true for
 * `timeout` ms after a successful write.
 */
export function useCopyToClipboard(timeout = 2000) {
	const { mutateAsync } = electronTrpc.external.copyPath.useMutation();
	const [copied, setCopied] = useState(false);

	const copyToClipboard = useCallback(
		async (text: string) => {
			await mutateAsync(text);
			setCopied(true);
			setTimeout(() => setCopied(false), timeout);
		},
		[mutateAsync, timeout],
	);

	return { copyToClipboard, copied };
}

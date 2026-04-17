import { useCallback, useState } from "react";

async function writeTextToClipboard(text: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(text);
		return;
	} catch {}

	const textarea = window.document.createElement("textarea");
	textarea.value = text;
	textarea.setAttribute("readonly", "");
	textarea.style.position = "fixed";
	textarea.style.top = "0";
	textarea.style.left = "0";
	textarea.style.width = "1px";
	textarea.style.height = "1px";
	textarea.style.opacity = "0";
	textarea.style.pointerEvents = "none";

	const body = window.document.body;
	body.appendChild(textarea);

	const previousSelection = window.document.getSelection();
	const previousRange =
		previousSelection && previousSelection.rangeCount > 0
			? previousSelection.getRangeAt(0)
			: null;

	try {
		textarea.select();
		textarea.setSelectionRange(0, text.length);
		const ok = window.document.execCommand("copy");
		if (!ok) throw new Error("Copy to clipboard failed");
	} finally {
		body.removeChild(textarea);
		if (previousRange && previousSelection) {
			previousSelection.removeAllRanges();
			previousSelection.addRange(previousRange);
		}
	}
}

export function useCopyToClipboard(timeout = 2000) {
	const [copied, setCopied] = useState(false);

	const copyToClipboard = useCallback(
		async (text: string) => {
			await writeTextToClipboard(text);
			setCopied(true);
			setTimeout(() => setCopied(false), timeout);
		},
		[timeout],
	);

	return { copyToClipboard, copied };
}

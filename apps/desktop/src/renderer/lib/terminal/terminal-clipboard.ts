async function writeNativeText(text: string): Promise<void> {
	const { electronTrpcClient } = await import("renderer/lib/trpc-client");
	await electronTrpcClient.external.copyText.mutate(text);
}

export async function writeTerminalClipboard(
	text: string,
	writeFallback: (text: string) => Promise<void> = writeNativeText,
): Promise<void> {
	try {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(text);
			return;
		}
	} catch {}
	await writeFallback(text);
}

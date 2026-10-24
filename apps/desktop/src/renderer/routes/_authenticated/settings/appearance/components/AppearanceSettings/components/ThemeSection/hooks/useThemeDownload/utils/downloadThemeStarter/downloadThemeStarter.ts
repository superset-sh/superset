import type { SelectDownload } from "@superset/local-db";

type Download = Pick<SelectDownload, "url" | "state">;
type Subscribe = (observer: {
	onData: (downloads: Download[]) => void;
	onError: (error: Error) => void;
}) => { unsubscribe: () => void };

export async function downloadThemeStarter(
	blob: Blob,
	subscribe: Subscribe,
	timeoutMs = 30_000,
): Promise<void> {
	const url = URL.createObjectURL(blob);
	let subscription: ReturnType<Subscribe> | undefined;
	let timeout: ReturnType<typeof setTimeout> | undefined;

	try {
		await new Promise<void>((resolve, reject) => {
			let finished = false;
			const finish = (error?: Error) => {
				if (finished) return;
				finished = true;
				if (error) reject(error);
				else resolve();
			};
			timeout = setTimeout(
				() => finish(new Error("Theme download timed out")),
				timeoutMs,
			);
			subscription = subscribe({
				onData: (downloads) => {
					const download = downloads.find((item) => item.url === url);
					if (!download || download.state === "progressing") return;
					finish(
						download.state === "completed"
							? undefined
							: new Error(`Theme download ${download.state}`),
					);
				},
				onError: finish,
			});
			if (finished) return;

			const link = document.createElement("a");
			link.href = url;
			link.download = "superset-theme-base.json";
			document.body.append(link);
			try {
				link.click();
			} finally {
				link.remove();
			}
		});
	} finally {
		clearTimeout(timeout);
		subscription?.unsubscribe();
		URL.revokeObjectURL(url);
	}
}

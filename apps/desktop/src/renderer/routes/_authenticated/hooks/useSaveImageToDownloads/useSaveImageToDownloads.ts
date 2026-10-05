import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

async function toBase64(blob: Blob): Promise<string> {
	const dataUrl = await new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
	return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

export function useSaveImageToDownloads() {
	const { t } = useLingui();
	const { mutateAsync } = electronTrpc.external.saveToDownloads.useMutation();
	return useCallback(
		async (src: string, filename: string) => {
			try {
				const blob = await (await fetch(src)).blob();
				const dataBase64 = await toBase64(blob);
				await mutateAsync({ filename, dataBase64 });
				toast.success(t({ message: "Saved to Downloads" }));
			} catch {
				toast.error(t({ message: "Download failed" }));
			}
		},
		[mutateAsync, t],
	);
}

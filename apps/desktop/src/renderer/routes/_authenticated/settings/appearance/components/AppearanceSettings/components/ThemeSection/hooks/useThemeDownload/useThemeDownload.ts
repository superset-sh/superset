import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { useRef, useState } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { downloadThemeStarter } from "./utils/downloadThemeStarter/downloadThemeStarter";

export function useThemeDownload() {
	const { t } = useLingui();
	const pending = useRef(false);
	const [isDownloading, setIsDownloading] = useState(false);

	const download = async (blob: Blob) => {
		if (pending.current) return;
		pending.current = true;
		setIsDownloading(true);
		try {
			await downloadThemeStarter(blob, (observer) =>
				electronTrpcClient.downloads.onChanged.subscribe(undefined, observer),
			);
			toast.success(t({ message: "Saved to Downloads" }));
		} catch {
			toast.error(t({ message: "Download failed" }));
		} finally {
			pending.current = false;
			setIsDownloading(false);
		}
	};

	return { download, isDownloading };
}

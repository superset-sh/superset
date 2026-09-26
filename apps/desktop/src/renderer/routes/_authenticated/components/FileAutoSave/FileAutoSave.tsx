import { useEffect } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { fileAutoSave } from "../../_dashboard/v2-workspace/$workspaceId/state/fileDocumentStore/fileAutoSave";

export function FileAutoSave() {
	const { data: mode = "off" } =
		electronTrpc.settings.getFileAutoSave.useQuery();
	useEffect(() => {
		const stop = fileAutoSave.start();
		const onBlur = () => fileAutoSave.onWindowChange();
		window.addEventListener("blur", onBlur);
		return () => {
			window.removeEventListener("blur", onBlur);
			stop();
		};
	}, []);
	useEffect(() => fileAutoSave.setMode(mode), [mode]);
	return null;
}

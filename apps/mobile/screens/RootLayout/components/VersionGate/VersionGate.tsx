import type { ReactNode } from "react";
import { useOtaUpdates } from "@/screens/RootLayout/hooks/useOtaUpdates";
import {
	APP_VERSION,
	useVersionGate,
} from "@/screens/RootLayout/hooks/useVersionGate";
import { UpdateRequiredScreen } from "./components/UpdateRequiredScreen";

export function VersionGate({ children }: { children: ReactNode }) {
	const gate = useVersionGate();
	useOtaUpdates();

	if (gate) {
		return (
			<UpdateRequiredScreen
				message={gate.message}
				currentVersion={APP_VERSION}
				minimumVersion={gate.minimumVersion}
			/>
		);
	}
	return children;
}

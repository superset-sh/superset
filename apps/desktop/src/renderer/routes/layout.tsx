import { Alerter } from "@superset/ui/atoms/Alert";
import type { ReactNode } from "react";
import { MobilePairingModal } from "renderer/components/MobilePairingModal";
import { PostHogUserIdentifier } from "renderer/components/PostHogUserIdentifier";
import { ThemedToaster } from "renderer/components/ThemedToaster";
import { AuthProvider } from "renderer/providers/AuthProvider";
import { ElectronTRPCProvider } from "renderer/providers/ElectronTRPCProvider";
import { MonacoProvider } from "renderer/providers/MonacoProvider";
import { PostHogProvider } from "renderer/providers/PostHogProvider";

export function RootLayout({ children }: { children: ReactNode }) {
	return (
		<PostHogProvider>
			<ElectronTRPCProvider>
				<PostHogUserIdentifier />
				<AuthProvider>
					<MonacoProvider>
						{children}
						<ThemedToaster />
						<Alerter />
						<MobilePairingModal />
					</MonacoProvider>
				</AuthProvider>
			</ElectronTRPCProvider>
		</PostHogProvider>
	);
}

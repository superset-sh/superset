import type { ReactNode } from "react";
import { PostHogUserIdentifier } from "renderer/components/PostHogUserIdentifier";
import { ThemedToaster } from "renderer/components/ThemedToaster";
import { TRPCProvider } from "renderer/providers/TRPCProvider";
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
					<TRPCProvider>
						<MonacoProvider>
							{children}
							<ThemedToaster />
						</MonacoProvider>
					</TRPCProvider>
				</AuthProvider>
			</ElectronTRPCProvider>
		</PostHogProvider>
	);
}

import type { ReactNode } from "react";
import { PostHogUserIdentifier } from "renderer/components/PostHogUserIdentifier";
import { ThemedToaster } from "renderer/components/ThemedToaster";
import { AuthProvider } from "renderer/providers/AuthProvider";
import { MonacoProvider } from "renderer/providers/MonacoProvider";
import { PostHogProvider } from "renderer/providers/PostHogProvider";
import { TRPCProvider } from "renderer/providers/TRPCProvider";

export function RootLayout({ children }: { children: ReactNode }) {
	return (
		<PostHogProvider>
			<TRPCProvider>
				<PostHogUserIdentifier />
				<AuthProvider>
					<MonacoProvider>
						{children}
						<ThemedToaster />
					</MonacoProvider>
				</AuthProvider>
			</TRPCProvider>
		</PostHogProvider>
	);
}

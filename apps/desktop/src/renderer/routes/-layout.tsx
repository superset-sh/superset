import { OutlitProvider } from "@outlit/browser/react";
import { Alerter } from "@superset/ui/atoms/Alert";
import type { ReactNode } from "react";
import { PostHogUserIdentifier } from "renderer/components/PostHogUserIdentifier";
import { TelemetrySync } from "renderer/components/TelemetrySync";
import { ThemedToaster } from "renderer/components/ThemedToaster";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { AuthProvider } from "renderer/providers/AuthProvider";
import { ElectronTRPCProvider } from "renderer/providers/ElectronTRPCProvider";
import { MonacoProvider } from "renderer/providers/MonacoProvider";
import { PostHogProvider } from "renderer/providers/PostHogProvider";

export function RootLayout({ children }: { children: ReactNode }) {
	const { data: session } = authClient.useSession();
	const user = session?.user;

	return (
		<PostHogProvider>
			<OutlitProvider
				publicKey={env.NEXT_PUBLIC_OUTLIT_KEY ?? ""}
				trackPageviews={false}
				user={
					user ? { email: user.email, userId: user.id, name: user.name } : null
				}
			>
				<ElectronTRPCProvider>
					<PostHogUserIdentifier />
					<TelemetrySync />
					<AuthProvider>
						<MonacoProvider>
							{children}
							<ThemedToaster />
							<Alerter />
						</MonacoProvider>
					</AuthProvider>
				</ElectronTRPCProvider>
			</OutlitProvider>
		</PostHogProvider>
	);
}

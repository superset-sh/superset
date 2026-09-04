import { I18nProvider } from "@superset/i18n/react";
import { Alerter } from "@superset/ui/atoms/Alert";
import type { ReactNode } from "react";
import { DesktopNoticesGate } from "renderer/components/DesktopNotices";
import { PostHogLocaleTagger } from "renderer/components/PostHogLocaleTagger";
import { PostHogSurfaceTagger } from "renderer/components/PostHogSurfaceTagger";
import { PostHogUserIdentifier } from "renderer/components/PostHogUserIdentifier";
import { TelemetrySync } from "renderer/components/TelemetrySync";
import { ThemedToaster } from "renderer/components/ThemedToaster";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { AuthProvider } from "renderer/providers/AuthProvider";
import { ElectronTRPCProvider } from "renderer/providers/ElectronTRPCProvider";
import { PostHogProvider } from "renderer/providers/PostHogProvider";

function LanguageAwareI18nProvider({ children }: { children: ReactNode }) {
	// Persisted setting wins; undefined falls back to first-load inference.
	const { data: language } = electronTrpc.settings.getLanguage.useQuery();
	return (
		<I18nProvider locale={language ?? undefined}>
			<PostHogLocaleTagger />
			{children}
		</I18nProvider>
	);
}

export function RootLayout({ children }: { children: ReactNode }) {
	return (
		<PostHogProvider>
			<ElectronTRPCProvider>
				<PostHogUserIdentifier />
				<PostHogSurfaceTagger />
				<TelemetrySync />
				<LanguageAwareI18nProvider>
					<AuthProvider>
						<DesktopNoticesGate>{children}</DesktopNoticesGate>
						<ThemedToaster />
						<Alerter />
					</AuthProvider>
				</LanguageAwareI18nProvider>
			</ElectronTRPCProvider>
		</PostHogProvider>
	);
}

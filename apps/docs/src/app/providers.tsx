"use client";

import { OutlitProvider } from "@outlit/browser/react";

import { env } from "@/env";

export function OutlitProviderWrapper({
	children,
}: {
	children: React.ReactNode;
}) {
	if (!env.NEXT_PUBLIC_OUTLIT_KEY) return <>{children}</>;

	return (
		<OutlitProvider publicKey={env.NEXT_PUBLIC_OUTLIT_KEY} trackPageviews>
			{children}
		</OutlitProvider>
	);
}

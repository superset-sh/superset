"use client";

import { OutlitProvider } from "@outlit/browser/react";

import { env } from "@/env";

export function OutlitProviderWrapper({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<OutlitProvider publicKey={env.NEXT_PUBLIC_OUTLIT_KEY} trackPageviews>
			{children}
		</OutlitProvider>
	);
}

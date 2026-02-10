"use client";

import { OutlitProvider } from "@outlit/browser/react";

import { getOutlit } from "@/lib/outlit";

export function OutlitProviderWrapper({
	children,
}: {
	children: React.ReactNode;
}) {
	return <OutlitProvider client={getOutlit()}>{children}</OutlitProvider>;
}

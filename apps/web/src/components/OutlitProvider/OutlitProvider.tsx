"use client";

import { OutlitProvider as OutlitBrowserProvider } from "@outlit/browser/react";
import { authClient } from "@superset/auth/client";
import type React from "react";

import { getOutlit } from "@/lib/outlit";

interface OutlitProviderProps {
	children: React.ReactNode;
}

export function OutlitProvider({ children }: OutlitProviderProps) {
	const { data: session } = authClient.useSession();
	const user = session?.user;

	return (
		<OutlitBrowserProvider
			client={getOutlit()}
			user={
				user
					? {
							email: user.email,
							userId: user.id,
							traits: { name: user.name },
						}
					: null
			}
		>
			{children}
		</OutlitBrowserProvider>
	);
}

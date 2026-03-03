import { OutlitProvider as OutlitBrowserProvider } from "@outlit/browser/react";
import type React from "react";
import { authClient } from "renderer/lib/auth-client";
import { outlit } from "renderer/lib/outlit";

interface OutlitProviderProps {
	children: React.ReactNode;
}

export function OutlitProvider({ children }: OutlitProviderProps) {
	const { data: session } = authClient.useSession();
	const user = session?.user;

	return (
		<OutlitBrowserProvider
			client={outlit}
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

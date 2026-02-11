import { OutlitProvider as OutlitBrowserProvider } from "@outlit/browser/react";
import type React from "react";
import { authClient } from "renderer/lib/auth-client";
import { getOutlit } from "renderer/lib/outlit";

interface OutlitProviderProps {
	children: React.ReactNode;
}

export function OutlitProvider({ children }: OutlitProviderProps) {
	const { data: session } = authClient.useSession();
	const user = session?.user;
	const client = getOutlit();

	if (!client) {
		return <>{children}</>;
	}

	return (
		<OutlitBrowserProvider
			client={client}
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

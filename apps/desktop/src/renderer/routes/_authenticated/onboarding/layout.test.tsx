import { expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const createChatServiceIpcClient = mock(() => ({ kind: "chat-client" }));
const navigate = mock(() => {});

mock.module("renderer/components/Chat/utils/chat-service-client", () => ({
	createChatServiceIpcClient,
}));
mock.module("@superset/chat/client", () => ({
	ChatServiceProvider: ({ children }: { children: ReactNode }) => children,
}));
mock.module("@tanstack/react-router", () => ({
	createFileRoute:
		() =>
		<TOptions,>(options: TOptions) =>
			options,
	Navigate: () => null,
	Outlet: () => null,
	useLocation: () => ({ pathname: "/onboarding" }),
	useNavigate: () => navigate,
}));
mock.module("renderer/lib/auth-client", () => ({
	authClient: {
		useSession: () => ({ data: null, isPending: false }),
	},
}));
mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		window: {
			getPlatform: {
				useQuery: () => ({ data: "darwin" }),
			},
		},
	},
}));
mock.module("renderer/providers/ElectronTRPCProvider", () => ({
	electronQueryClient: {},
}));
mock.module("./components/OnboardingNavigation", () => ({
	OnboardingNavigation: () => null,
}));

test("reuses one IPC client when the onboarding layout remounts", async () => {
	const { Route } = await import("./layout");
	const Layout = (
		Route as unknown as {
			component: () => ReactNode;
		}
	).component;

	renderToStaticMarkup(createElement(Layout));
	renderToStaticMarkup(createElement(Layout));

	expect(createChatServiceIpcClient).toHaveBeenCalledTimes(1);
});

import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { ReactNode } from "react";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();

// biome-ignore lint/suspicious/noExplicitAny: trpc-electron reads this preload global at import time.
(globalThis as any).electronTRPC = {
	sendMessage: () => {},
	onMessage: () => {},
};

const { cleanup, render } = await import("@testing-library/react");
const router = await import("@tanstack/react-router");
const command = await import("@superset/ui/command");

mock.module("@superset/ui/command", () => ({
	...command,
	CommandEmpty: ({ children }: { children: ReactNode }) => <>{children}</>,
	CommandGroup: ({
		children,
		heading,
	}: {
		children: ReactNode;
		heading: ReactNode;
	}) => (
		<section>
			<h2>{heading}</h2>
			{children}
		</section>
	),
	CommandItem: ({
		children,
		onSelect: _onSelect,
		...props
	}: {
		children: ReactNode;
		onSelect: () => void;
	}) => <div {...props}>{children}</div>,
	CommandList: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
mock.module("@superset/ui/utils", () => ({
	cn: (...classes: (string | false)[]) => classes.filter(Boolean).join(" "),
}));
mock.module("renderer/hooks/useIsV2CloudEnabled", () => ({
	useIsV2CloudEnabled: () => false,
}));
mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		createClient: () => ({}),
		workspaces: {
			getAllGrouped: {
				useQuery: () => ({
					data: [
						{
							project: {
								id: "project-1",
								name: "App",
								color: "#000",
							},
							workspaces: [
								{
									id: "workspace-1",
									name: "fix-palette-search",
									branch: "feat/palette-search",
								},
							],
						},
					],
				}),
			},
		},
	},
}));
mock.module("@tanstack/react-router", () => ({
	...router,
	useLocation: () => "/",
	useNavigate: () => mock(() => {}),
}));
mock.module(
	"renderer/routes/_authenticated/_dashboard/utils/workspace-navigation",
	() => ({
		navigateToV2Workspace: mock(() => Promise.resolve()),
		navigateToWorkspace: mock(() => Promise.resolve()),
	}),
);
mock.module(
	"renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces",
	() => ({
		useAccessibleV2Workspaces: () => ({ all: [] }),
	}),
);
mock.module("renderer/utils/getV2WorkspaceDisplayName", () => ({
	getV2WorkspaceDisplayName: () => "",
}));
mock.module("../../core/frames", () => ({
	useFrameStackStore: (
		selector: (state: { setOpen: (open: boolean) => void }) => unknown,
	) => selector({ setOpen: mock(() => {}) }),
}));

const { WorkspaceSearchResults } = await import("./WorkspaceListFrame");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

describe("WorkspaceSearchResults", () => {
	test("shows matching workspaces in a Workspaces group", () => {
		const { getByRole, getByText } = render(
			<WorkspaceSearchResults query="palette" />,
		);

		expect(getByRole("heading", { name: "Workspaces" })).toBeDefined();
		expect(getByText("fix-palette-search")).toBeDefined();
	});

	test("does not render a group without a query or match", () => {
		const { container, rerender } = render(<WorkspaceSearchResults query="" />);

		expect(container.textContent).toBe("");

		rerender(<WorkspaceSearchResults query="unmatched" />);

		expect(container.textContent).toBe("");
	});
});

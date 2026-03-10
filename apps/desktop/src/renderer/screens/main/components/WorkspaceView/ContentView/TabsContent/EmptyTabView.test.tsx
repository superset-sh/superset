import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

// Mock heavy deps before importing the component under test
mock.module("@superset/shared/constants", () => ({
	FEATURE_FLAGS: { AI_CHAT: "ai-chat" },
}));

mock.module("@superset/ui/sonner", () => ({
	toast: {
		promise: () => {},
		warning: () => {},
	},
}));

mock.module("@tanstack/react-router", () => ({
	useParams: () => ({ workspaceId: "ws-1" }),
	useNavigate: () => () => {},
}));

mock.module("posthog-js/react", () => ({
	useFeatureFlagEnabled: () => false,
}));

mock.module("renderer/components/OpenInExternalDropdown", () => ({
	getAppOption: () => null,
}));

const mockMutateAsync = mock(() =>
	Promise.resolve({ terminalWarning: undefined }),
);
mock.module("renderer/react-query/workspaces", () => ({
	useCloseWorkspace: () => ({ mutateAsync: mockMutateAsync }),
}));

mock.module("renderer/stores/hotkeys", () => ({
	useHotkeyDisplay: () => [],
}));

mock.module("renderer/stores/tabs/store", () => ({
	useTabsStore: (
		_selector: (s: {
			addChatMastraTab: () => void;
			addBrowserTab: () => void;
		}) => unknown,
	) => _selector({ addChatMastraTab: () => {}, addBrowserTab: () => {} }),
}));

mock.module("renderer/stores/tabs/useTabsWithPresets", () => ({
	useTabsWithPresets: () => ({ addTab: () => {} }),
}));

mock.module("renderer/stores/theme", () => ({
	useTheme: () => ({ type: "dark" }),
}));

mock.module("./assets/superset-empty-state-wordmark.svg", () => ({
	default: "superset-logo.svg",
}));

mock.module("./components/EmptyTabActionButton", () => ({
	EmptyTabActionButton: ({
		label,
		onClick,
	}: {
		label: string;
		display: string[];
		icon: unknown;
		onClick: () => void;
	}) => (
		<button type="button" onClick={onClick}>
			{label}
		</button>
	),
}));

const { EmptyTabView } = await import("./EmptyTabView");

describe("EmptyTabView", () => {
	test("renders a Hide Workspace button", () => {
		const html = renderToStaticMarkup(
			<EmptyTabView
				defaultExternalApp={null}
				onOpenInApp={() => {}}
				onOpenQuickOpen={() => {}}
			/>,
		);

		expect(html).toContain("Hide Workspace");
	});

	test("renders standard action buttons alongside Hide Workspace", () => {
		const html = renderToStaticMarkup(
			<EmptyTabView
				defaultExternalApp={null}
				onOpenInApp={() => {}}
				onOpenQuickOpen={() => {}}
			/>,
		);

		expect(html).toContain("Open Terminal");
		expect(html).toContain("Open Browser");
		expect(html).toContain("Search Files");
		expect(html).toContain("Hide Workspace");
	});
});

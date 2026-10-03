import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// @pierre/diffs renders into a shadow root, which happy-dom does not implement.
// The behaviour under test is the identity of the props we hand it, not its
// output, so record the props rather than trying to render the real component.
interface CapturedFile {
	name: string;
	contents: string;
}

const capturedProps: Array<{ oldFile: CapturedFile; newFile: CapturedFile }> =
	[];

mock.module("@pierre/diffs/react", () => ({
	MultiFileDiff: (props: { oldFile: CapturedFile; newFile: CapturedFile }) => {
		capturedProps.push(props);
		return null;
	},
}));

mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		settings: {
			getFontSettings: {
				useQuery: () => ({ data: undefined }),
			},
		},
	},
}));

mock.module("renderer/stores/theme", () => ({
	useResolvedTheme: () => ({ type: "dark" }),
}));

mock.module(
	"renderer/screens/main/components/WorkspaceView/utils/code-theme",
	() => ({
		getDiffsTheme: () => "test-diff-theme",
		getDiffViewerStyle: () => ({}),
	}),
);

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, render } = await import("@testing-library/react");
const { LightDiffViewer } = await import("./LightDiffViewer");

afterEach(() => {
	capturedProps.length = 0;
	cleanup();
});
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

const contents = {
	original: "const value = 1;\n",
	modified: "const value = 2;\n",
	language: "typescript",
};

function lastCapturedProps() {
	const props = capturedProps.at(-1);
	if (!props) {
		throw new Error("MultiFileDiff was never rendered");
	}
	return props;
}

describe("LightDiffViewer", () => {
	test("keeps the file descriptors referentially stable across re-renders", () => {
		const view = render(
			<LightDiffViewer
				contents={contents}
				viewMode="inline"
				filePath="src/a.ts"
			/>,
		);
		const first = lastCapturedProps();

		view.rerender(
			<LightDiffViewer
				contents={contents}
				viewMode="inline"
				filePath="src/a.ts"
			/>,
		);
		const second = lastCapturedProps();

		// A new object identity here makes @pierre/diffs re-parse the diff and
		// rebuild its DOM, which scrolls the diff container back to the top.
		expect(second.oldFile).toBe(first.oldFile);
		expect(second.newFile).toBe(first.newFile);
	});

	test("rebuilds only the descriptor whose content changed", () => {
		const view = render(
			<LightDiffViewer
				contents={contents}
				viewMode="inline"
				filePath="src/a.ts"
			/>,
		);
		const first = lastCapturedProps();

		view.rerender(
			<LightDiffViewer
				contents={{ ...contents, modified: "const value = 3;\n" }}
				viewMode="inline"
				filePath="src/a.ts"
			/>,
		);
		const second = lastCapturedProps();

		expect(second.oldFile).toBe(first.oldFile);
		expect(second.newFile).not.toBe(first.newFile);
		expect(second.newFile.contents).toBe("const value = 3;\n");
	});
});

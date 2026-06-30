import { describe, expect, mock, test } from "bun:test";
import { COMPANY } from "@superset/shared/constants";
import { RELEASES_URL } from "shared/auto-update";

// Reproduces #5222: the desktop update prompt's "See changes" link opened the
// marketing-site changelog (`https://superset.sh/changelog`) via
// `COMPANY.CHANGELOG_URL`. That page is not kept in sync with releases, so
// users were prompted to install an update with no accurate "what's changed"
// destination. The maintained source of release notes is GitHub Releases,
// already exposed as `RELEASES_URL`.
//
// There is no DOM render harness in this app, so we mock the tRPC client to
// capture which URL the "See changes" button opens, then walk the element tree
// returned by the component and invoke that button's handler directly.

const openUrlMutate = mock((_url: string) => {});

mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		external: {
			openUrl: { useMutation: () => ({ mutate: openUrlMutate }) },
		},
		autoUpdate: {
			install: { useMutation: () => ({ mutate: mock(), isPending: false }) },
			dismiss: { useMutation: () => ({ mutate: mock() }) },
		},
	},
}));

const { UpdateToast } = await import("./UpdateToast");

type ElementNode = {
	props?: { children?: unknown; onClick?: unknown };
};

function findButtonOnClickByLabel(
	node: unknown,
	label: string,
): (() => void) | null {
	if (!node || typeof node !== "object") return null;
	const { props } = node as ElementNode;
	const children = props?.children;
	const flat = Array.isArray(children) ? children : [children];
	const text = flat.filter((c) => typeof c === "string").join("");
	if (text.includes(label) && typeof props?.onClick === "function") {
		return props.onClick as () => void;
	}
	for (const child of flat) {
		const found = findButtonOnClickByLabel(child, label);
		if (found) return found;
	}
	return null;
}

describe("update prompt release-notes link (#5222)", () => {
	test("RELEASES_URL points at GitHub Releases, not the marketing changelog", () => {
		expect(RELEASES_URL).toContain("github.com");
		expect(RELEASES_URL).toContain("/releases");
		expect(RELEASES_URL).not.toBe(COMPANY.CHANGELOG_URL);
	});

	test('"See changes" opens GitHub Releases, not the stale marketing changelog', () => {
		openUrlMutate.mockClear();

		const tree = UpdateToast({
			toastId: "t",
			status: "ready",
			version: "1.2.3",
		});
		const onClick = findButtonOnClickByLabel(tree, "See changes");
		expect(onClick).toBeFunction();
		onClick?.();

		expect(openUrlMutate).toHaveBeenCalledWith(RELEASES_URL);
		expect(openUrlMutate).not.toHaveBeenCalledWith(COMPANY.CHANGELOG_URL);
	});
});

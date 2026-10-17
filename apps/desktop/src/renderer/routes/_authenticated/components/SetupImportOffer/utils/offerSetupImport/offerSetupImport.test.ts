import { describe, expect, mock, test } from "bun:test";
import {
	offerSetupImport,
	type SetupImportOfferDeps,
	type SetupImportOfferTarget,
} from "./offerSetupImport";

const target: SetupImportOfferTarget = {
	hostUrl: "http://127.0.0.1:1",
	projectId: "project-1",
	projectName: "acme-api",
};

function makeDeps(overrides: Partial<SetupImportOfferDeps> = {}) {
	const prompt = mock<SetupImportOfferDeps["prompt"]>(() => {});
	const hasImport = mock<SetupImportOfferDeps["hasImport"]>(async () => true);
	const deps: SetupImportOfferDeps = {
		isPromptWindow: async () => true,
		waitForFocus: async () => {},
		isDismissed: () => false,
		hasImport,
		prompt,
		...overrides,
	};
	return { deps, prompt: deps.prompt as typeof prompt, hasImport };
}

describe("offerSetupImport", () => {
	test("prompts for an importable project", async () => {
		const { deps, prompt } = makeDeps();
		await offerSetupImport(target, deps, new AbortController().signal);
		expect(prompt).toHaveBeenCalledWith(target);
	});

	test("stays quiet in a window that is not the org's last focused", async () => {
		const { deps, prompt, hasImport } = makeDeps({
			isPromptWindow: async () => false,
		});
		await offerSetupImport(target, deps, new AbortController().signal);
		expect(hasImport).not.toHaveBeenCalled();
		expect(prompt).not.toHaveBeenCalled();
	});

	test("checks the project only after the window gets focus", async () => {
		const order: string[] = [];
		const { deps } = makeDeps({
			waitForFocus: async () => {
				order.push("focus");
			},
			hasImport: async () => {
				order.push("check");
				return true;
			},
		});
		await offerSetupImport(target, deps, new AbortController().signal);
		expect(order).toEqual(["focus", "check"]);
	});

	test("does not prompt for a dismissed project", async () => {
		const { deps, prompt } = makeDeps({ isDismissed: () => true });
		await offerSetupImport(target, deps, new AbortController().signal);
		expect(prompt).not.toHaveBeenCalled();
	});

	test("does not prompt when there is nothing to import", async () => {
		const { deps, prompt } = makeDeps({ hasImport: async () => false });
		await offerSetupImport(target, deps, new AbortController().signal);
		expect(prompt).not.toHaveBeenCalled();
	});

	test("does not prompt after the listener unmounts", async () => {
		const controller = new AbortController();
		const { deps, prompt } = makeDeps({
			hasImport: async () => {
				controller.abort();
				return true;
			},
		});
		await offerSetupImport(target, deps, controller.signal);
		expect(prompt).not.toHaveBeenCalled();
	});
});

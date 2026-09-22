import { afterAll, afterEach, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render, within } = await import(
	"@testing-library/react"
);
const { QueryClient, QueryClientProvider } = await import(
	"@tanstack/react-query"
);
const { useState } = await import("react");
const { AuthorFilter } = await import("./AuthorFilter");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

function FilterHarness() {
	const [value, setValue] = useState<string | null>(null);
	return <AuthorFilter value={value} onChange={setValue} projectTargets={[]} />;
}

test("selects multiple custom authors, retains them on reopen, and toggles or clears them", async () => {
	const client = new QueryClient();
	render(
		<QueryClientProvider client={client}>
			<FilterHarness />
		</QueryClientProvider>,
	);
	const page = within(document.body);
	await act(async () => {
		fireEvent.click(page.getByRole("button", { name: "Author: All authors" }));
	});
	for (const login of ["alice", "bob"]) {
		await act(async () => {
			fireEvent.change(page.getByRole("combobox"), {
				target: { value: login },
			});
		});
		await act(async () => {
			fireEvent.click(
				page.getByRole("option", { name: `Filter by @${login}` }),
			);
		});
		expect(page.getByRole("dialog")).toBeTruthy();
		expect(
			page.getByRole("option", { name: login }).getAttribute("aria-checked"),
		).toBe("true");
	}
	expect(
		page.getByRole("button", { name: "Author: @alice, @bob" }),
	).toBeTruthy();
	await act(async () => {
		fireEvent.keyDown(page.getByRole("combobox"), {
			key: "Escape",
			code: "Escape",
		});
	});
	expect(page.queryByRole("dialog")).toBeNull();
	await act(async () => {
		fireEvent.click(page.getByRole("button", { name: "Author: @alice, @bob" }));
	});
	expect(
		page.getByRole("option", { name: "alice" }).getAttribute("aria-checked"),
	).toBe("true");
	expect(
		page.getByRole("option", { name: "bob" }).getAttribute("aria-checked"),
	).toBe("true");
	await act(async () => {
		fireEvent.click(page.getByRole("option", { name: "alice" }));
	});
	expect(page.getByRole("button", { name: "Author: @bob" })).toBeTruthy();
	await act(async () => {
		fireEvent.click(page.getByRole("option", { name: "All authors" }));
	});
	expect(
		page.getByRole("button", { name: "Author: All authors" }),
	).toBeTruthy();
	expect(
		page
			.getByRole("option", { name: "All authors" })
			.getAttribute("aria-checked"),
	).toBe("true");
	client.clear();
});

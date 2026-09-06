import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render, within } = await import(
	"@testing-library/react"
);
const { AutoSwitchSettings } = await import("./AutoSwitchSettings");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

type Props = Parameters<typeof AutoSwitchSettings>[0];

const SETTINGS: Props["settings"] = {
	enabled: true,
	thresholdPercent: 90,
	strategy: "best",
	modelWindows: [],
	pollIntervalSeconds: 60,
	cooldownSeconds: 300,
};

function setup(props: Partial<Props> = {}) {
	const commits: Array<Partial<Props["settings"]>> = [];
	const onCommit = mock((patch: Partial<Props["settings"]>) => {
		commits.push(patch);
		return Promise.resolve();
	});
	const view = render(
		<AutoSwitchSettings
			agentLabel="Claude Code"
			settings={SETTINGS}
			engineAvailable
			platformSupported
			lockOwner
			disabled={false}
			onCommit={onCommit}
			{...props}
		/>,
	);
	return {
		commits,
		onCommit,
		ui: within(view.baseElement as HTMLElement),
		view,
	};
}

describe("AutoSwitchSettings controls", () => {
	test("the threshold field sends the number the user typed", async () => {
		const { commits, ui } = setup();
		const field = ui.getByRole("spinbutton", {
			name: "Switch at",
		}) as HTMLInputElement;
		await act(async () => {
			fireEvent.change(field, { target: { value: "75" } });
			fireEvent.blur(field);
		});
		expect(commits).toEqual([{ thresholdPercent: 75 }]);
	});

	test("a threshold past the ends is pulled back in range, not refused", async () => {
		const { commits, ui } = setup();
		const field = ui.getByRole("spinbutton", {
			name: "Switch at",
		}) as HTMLInputElement;
		expect(field.getAttribute("min")).toBe("1");
		expect(field.getAttribute("max")).toBe("100");
		await act(async () => {
			fireEvent.change(field, { target: { value: "150" } });
			fireEvent.blur(field);
		});
		expect(commits).toEqual([{ thresholdPercent: 100 }]);
		expect(ui.queryByRole("alert")).toBeNull();
	});

	// R14: the host accepts 60 to 3600 seconds, so the control must not offer
	// a number outside it.
	test("the cooldown field only offers minutes the host accepts", async () => {
		const { commits, ui } = setup();
		const field = ui.getByRole("spinbutton", {
			name: "Wait between switches",
		}) as HTMLInputElement;
		expect(field.getAttribute("min")).toBe("1");
		expect(field.getAttribute("max")).toBe("60");
		await act(async () => {
			fireEvent.change(field, { target: { value: "0" } });
			fireEvent.blur(field);
		});
		await act(async () => {
			fireEvent.change(field, { target: { value: "120" } });
			fireEvent.blur(field);
		});
		expect(commits).toEqual([
			{ cooldownSeconds: 60 },
			{ cooldownSeconds: 3600 },
		]);
		expect(ui.queryByRole("alert")).toBeNull();
	});

	test("the model-window list is capped where the host caps it", async () => {
		const { commits, ui } = setup();
		const field = ui.getByRole("textbox", {
			name: "Model windows",
		}) as HTMLInputElement;
		await act(async () => {
			fireEvent.change(field, {
				target: { value: "a, b, c, d, e, f, g, h, i, j" },
			});
			fireEvent.blur(field);
		});
		expect(commits).toEqual([
			{ modelWindows: ["a", "b", "c", "d", "e", "f", "g", "h"] },
		]);
	});

	test("picking a strategy sends the one the user chose", async () => {
		const { commits, ui } = setup();
		await act(async () => {
			fireEvent.keyDown(
				ui.getByRole("combobox", { name: "Which account to move to" }),
				{ key: "ArrowDown" },
			);
		});
		await act(async () => {
			fireEvent.click(
				ui.getByRole("option", { name: "Use up the soonest reset" }),
			);
		});
		expect(commits).toEqual([{ strategy: "consume-first" }]);
	});

	test("picking a poll interval sends it in seconds", async () => {
		const { commits, ui } = setup();
		await act(async () => {
			fireEvent.keyDown(
				ui.getByRole("combobox", { name: "Check usage every" }),
				{ key: "ArrowDown" },
			);
		});
		await act(async () => {
			fireEvent.click(ui.getByRole("option", { name: "2 minutes" }));
		});
		expect(commits).toEqual([{ pollIntervalSeconds: 120 }]);
	});

	test("model windows are trimmed and blank entries dropped", async () => {
		const { commits, ui } = setup();
		const field = ui.getByRole("textbox", {
			name: "Model windows",
		}) as HTMLInputElement;
		await act(async () => {
			fireEvent.change(field, { target: { value: "Fable, , Opus, " } });
			fireEvent.blur(field);
		});
		expect(commits).toEqual([{ modelWindows: ["Fable", "Opus"] }]);
	});

	// The NaN branch reverts instead of erroring, so the number on screen is
	// always the one the engine is using.
	test("a cooldown that is not a number is dropped, and a real one is sent", async () => {
		const { commits, ui } = setup();
		const field = ui.getByRole("spinbutton", {
			name: "Wait between switches",
		}) as HTMLInputElement;
		await act(async () => {
			fireEvent.change(field, { target: { value: "abc" } });
			fireEvent.blur(field);
		});
		expect(commits).toEqual([]);
		expect(
			(
				ui.getByRole("spinbutton", {
					name: "Wait between switches",
				}) as HTMLInputElement
			).value,
		).toBe("5");
		expect(ui.queryByRole("alert")).toBeNull();

		await act(async () => {
			fireEvent.change(field, { target: { value: "10" } });
			fireEvent.blur(field);
		});
		expect(commits).toEqual([{ cooldownSeconds: 600 }]);
	});

	test("a refusal reverts the control and says why", async () => {
		const onCommit = mock(() => Promise.reject(new Error("invalid-settings")));
		const view = render(
			<AutoSwitchSettings
				agentLabel="Claude Code"
				settings={SETTINGS}
				engineAvailable
				platformSupported
				lockOwner
				disabled={false}
				onCommit={onCommit}
			/>,
		);
		const ui = within(view.baseElement as HTMLElement);
		const field = ui.getByRole("spinbutton", {
			name: "Switch at",
		}) as HTMLInputElement;
		await act(async () => {
			fireEvent.change(field, { target: { value: "42" } });
			fireEvent.blur(field);
		});
		expect(ui.getByRole("alert").textContent).toContain(
			"previous one still stands",
		);
		expect(
			(ui.getByRole("spinbutton", { name: "Switch at" }) as HTMLInputElement)
				.value,
		).toBe("90");
	});

	test("an offline host leaves every control untouchable", () => {
		const { ui } = setup({ disabled: true });
		expect(
			(ui.getByRole("spinbutton", { name: "Switch at" }) as HTMLInputElement)
				.disabled,
		).toBe(true);
		expect(
			ui
				.getByRole("switch", { name: "Switch accounts automatically" })
				.hasAttribute("disabled"),
		).toBe(true);
	});

	test("the detail controls stay out of the way until auto-switch is on", () => {
		const { ui } = setup({ settings: { ...SETTINGS, enabled: false } });
		expect(ui.queryByRole("spinbutton", { name: "Switch at" })).toBeNull();
		expect(
			ui.getByRole("switch", { name: "Switch accounts automatically" }),
		).toBeTruthy();
	});
});

describe("AutoSwitchSettings refusals", () => {
	test("Windows gets the reason instead of a switch it cannot honour", () => {
		const { ui, view } = setup({ platformSupported: false });
		expect(ui.queryByRole("switch")).toBeNull();
		expect(view.baseElement.textContent).toContain("needs macOS or Linux");
	});

	test("a host with no engine says so", () => {
		const { ui, view } = setup({ engineAvailable: false });
		expect(ui.queryByRole("switch")).toBeNull();
		expect(view.baseElement.textContent).toContain(
			"account engine is not running on this host",
		);
	});

	test("a lock loser points at the instance that owns switching", () => {
		const { ui, view } = setup({ lockOwner: false });
		expect(ui.queryByRole("switch")).toBeNull();
		expect(view.baseElement.textContent).toContain(
			"Another Superset instance on this machine owns automatic switching",
		);
	});
});

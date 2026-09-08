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

	// Select-all then type: the field has to hold "" for the keystroke in
	// between, or the digit lands after a coerced 1 and 15 is what is sent.
	test("a cleared threshold field keeps what is typed instead of snapping to 1", async () => {
		const { commits, ui } = setup();
		const field = ui.getByRole("spinbutton", {
			name: "Switch at",
		}) as HTMLInputElement;
		await act(async () => {
			fireEvent.change(field, { target: { value: "" } });
		});
		expect(
			(ui.getByRole("spinbutton", { name: "Switch at" }) as HTMLInputElement)
				.value,
		).toBe("");
		await act(async () => {
			// A keystroke appends to whatever the controlled field is showing,
			// so a field forced back to 1 turns the "5" into 15.
			fireEvent.change(field, { target: { value: `${field.value}5` } });
		});
		expect(
			(ui.getByRole("spinbutton", { name: "Switch at" }) as HTMLInputElement)
				.value,
		).toBe("5");
		await act(async () => {
			fireEvent.blur(field);
		});
		expect(commits).toEqual([{ thresholdPercent: 5 }]);
	});

	// Tabbing through is not an edit, so it must not write settings back.
	test("tabbing through the threshold field sends nothing", async () => {
		const { commits, ui } = setup();
		const field = ui.getByRole("spinbutton", {
			name: "Switch at",
		}) as HTMLInputElement;
		await act(async () => {
			fireEvent.focus(field);
			fireEvent.blur(field);
		});
		expect(commits).toEqual([]);
		expect(ui.queryByRole("alert")).toBeNull();
	});

	// The host refuses a name past 64 characters with a schema error whose
	// JSON is no use on screen, so the panel states the rule itself.
	test("a model name past the host's cap is refused in words, not schema JSON", async () => {
		const { commits, ui } = setup();
		const field = ui.getByRole("textbox", {
			name: "Model windows",
		}) as HTMLInputElement;
		await act(async () => {
			fireEvent.change(field, { target: { value: `Opus, ${"m".repeat(65)}` } });
			fireEvent.blur(field);
		});
		expect(commits).toEqual([]);
		const alert = ui.getByRole("alert").textContent ?? "";
		expect(alert).toContain("at most 64 characters");
		expect(alert).not.toContain("{");
		expect(alert).not.toContain("too_big");
		// What was typed stays put so the long name can be shortened.
		expect(
			(ui.getByRole("textbox", { name: "Model windows" }) as HTMLInputElement)
				.value,
		).toContain("Opus");
	});

	// Putting the field back the way it was is not an edit, so it commits
	// nothing — but the complaint about the value that is gone must go too.
	test("restoring the model field clears the complaint about what was typed", async () => {
		const { commits, ui } = setup({
			settings: { ...SETTINGS, modelWindows: ["Opus"] },
		});
		const field = ui.getByRole("textbox", {
			name: "Model windows",
		}) as HTMLInputElement;
		await act(async () => {
			fireEvent.change(field, { target: { value: "m".repeat(65) } });
			fireEvent.blur(field);
		});
		expect(ui.getByRole("alert").textContent).toContain(
			"at most 64 characters",
		);
		await act(async () => {
			fireEvent.change(field, { target: { value: "Opus" } });
			fireEvent.blur(field);
		});
		expect(commits).toEqual([]);
		expect(ui.queryByRole("alert")).toBeNull();
	});

	// A one-line field is finished with Enter; doing nothing looks like it saved.
	test("Enter sends the threshold instead of doing nothing", async () => {
		const { commits, ui } = setup();
		const field = ui.getByRole("spinbutton", {
			name: "Switch at",
		}) as HTMLInputElement;
		await act(async () => {
			field.focus();
			fireEvent.change(field, { target: { value: "75" } });
			fireEvent.keyDown(field, { key: "Enter" });
		});
		expect(commits).toEqual([{ thresholdPercent: 75 }]);
	});

	test("Enter sends the model windows and the cooldown too", async () => {
		const { commits, ui } = setup();
		const models = ui.getByRole("textbox", {
			name: "Model windows",
		}) as HTMLInputElement;
		await act(async () => {
			models.focus();
			fireEvent.change(models, { target: { value: "Opus" } });
			fireEvent.keyDown(models, { key: "Enter" });
		});
		const cooldown = ui.getByRole("spinbutton", {
			name: "Wait between switches",
		}) as HTMLInputElement;
		await act(async () => {
			cooldown.focus();
			fireEvent.change(cooldown, { target: { value: "10" } });
			fireEvent.keyDown(cooldown, { key: "Enter" });
		});
		expect(commits).toEqual([
			{ modelWindows: ["Opus"] },
			{ cooldownSeconds: 600 },
		]);
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

	// A stored 90s shows as "2 min", so re-reading the field on blur would send
	// 120s back. Only an edit is allowed to move the host's value.
	test("tabbing through the cooldown field leaves an odd stored value alone", async () => {
		const { commits, ui } = setup({
			settings: { ...SETTINGS, cooldownSeconds: 90 },
		});
		const field = ui.getByRole("spinbutton", {
			name: "Wait between switches",
		}) as HTMLInputElement;
		expect(field.value).toBe("2");
		await act(async () => {
			fireEvent.focus(field);
			fireEvent.blur(field);
		});
		expect(commits).toEqual([]);
	});

	test("an edited cooldown still reaches the host from an odd stored value", async () => {
		const { commits, ui } = setup({
			settings: { ...SETTINGS, cooldownSeconds: 90 },
		});
		const field = ui.getByRole("spinbutton", {
			name: "Wait between switches",
		}) as HTMLInputElement;
		await act(async () => {
			fireEvent.change(field, { target: { value: "3" } });
			fireEvent.blur(field);
		});
		expect(commits).toEqual([{ cooldownSeconds: 180 }]);
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

	// The models field sits between the threshold and the poll pair in tab
	// order, so tabbing past it must not swallow the refusal the threshold
	// just got — that would make the refusal silent.
	test("tabbing through the model field leaves another control's refusal on screen", async () => {
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
		await act(async () => {
			const threshold = ui.getByRole("spinbutton", { name: "Switch at" });
			fireEvent.change(threshold, { target: { value: "40" } });
			fireEvent.blur(threshold);
		});
		expect(ui.getByRole("alert").textContent).toContain(
			"previous one still stands",
		);
		await act(async () => {
			const models = ui.getByRole("textbox", { name: "Model windows" });
			fireEvent.focus(models);
			fireEvent.blur(models);
		});
		expect(onCommit).toHaveBeenCalledTimes(1);
		expect(ui.getByRole("alert").textContent).toContain(
			"previous one still stands",
		);
		expect(
			(ui.getByRole("spinbutton", { name: "Switch at" }) as HTMLInputElement)
				.value,
		).toBe("90");
	});

	// The 64-character complaint promised the long name would stay put until
	// it is shortened, so saving another control must not delete it, nor the
	// line that says why it is still there.
	test("a kept model draft and its complaint survive another control's save", async () => {
		const { commits, ui } = setup();
		const typed = `Opus, ${"m".repeat(70)}`;
		await act(async () => {
			const models = ui.getByRole("textbox", { name: "Model windows" });
			fireEvent.change(models, { target: { value: typed } });
			fireEvent.blur(models);
		});
		expect(commits).toEqual([]);
		await act(async () => {
			const threshold = ui.getByRole("spinbutton", { name: "Switch at" });
			fireEvent.change(threshold, { target: { value: "75" } });
			fireEvent.blur(threshold);
		});
		expect(commits).toEqual([{ thresholdPercent: 75 }]);
		expect(
			(ui.getByRole("textbox", { name: "Model windows" }) as HTMLInputElement)
				.value,
		).toBe(typed);
		expect(ui.getByRole("alert").textContent).toContain(
			"at most 64 characters",
		);
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

import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type ToggleHandler = (checked: boolean) => void;

let voiceShortcutText = "⌘⇧V";
let voiceInputEnabled = true;
let voiceToggleHandler: ToggleHandler | undefined;

const setVoiceInputEnabledMutateMock = mock((input: { enabled: boolean }) => {
	voiceInputEnabled = input.enabled;
});

mock.module("@superset/ui/button", () => ({
	Button: ({
		children,
		onClick,
	}: {
		children?: ReactNode;
		onClick?: () => void;
	}) => (
		<button onClick={onClick} type="button">
			{children}
		</button>
	),
}));

mock.module("@superset/ui/switch", () => ({
	Switch: ({
		id,
		checked,
		disabled,
		onCheckedChange,
		"aria-describedby": ariaDescribedBy,
	}: {
		id?: string;
		checked?: boolean;
		disabled?: boolean;
		onCheckedChange?: ToggleHandler;
		"aria-describedby"?: string;
	}) => {
		if (id === "voice-input") {
			voiceToggleHandler = onCheckedChange;
		}

		return (
			<button
				aria-checked={checked}
				aria-describedby={ariaDescribedBy}
				disabled={disabled}
				id={id}
				role="switch"
				type="button"
			/>
		);
	},
}));

mock.module("renderer/hotkeys", () => ({
	useHotkeyDisplay: () => ({
		keys: voiceShortcutText === "Unassigned" ? ["Unassigned"] : [],
		text: voiceShortcutText,
	}),
}));

mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		useUtils: () => ({
			permissions: {
				getStatus: {
					invalidate: mock(() => undefined),
				},
			},
			settings: {
				getConfirmOnQuit: queryUtils(true),
				getFileOpenMode: queryUtils("split-pane"),
				getOpenLinksInApp: queryUtils(false),
				getShowResourceMonitor: queryUtils(false),
				getVoiceInputEnabled: queryUtils(voiceInputEnabled),
			},
		}),
		permissions: {
			getStatus: {
				useQuery: () => ({
					data: {
						accessibility: true,
						fullDiskAccess: true,
						microphone: true,
						microphoneStatus: "granted",
					},
					isLoading: false,
				}),
			},
			requestMicrophone: {
				useMutation: () => ({
					isPending: false,
					mutate: mock(() => undefined),
				}),
			},
		},
		settings: {
			getConfirmOnQuit: {
				useQuery: () => ({ data: true, isLoading: false }),
			},
			setConfirmOnQuit: {
				useMutation: () => mutationMock(),
			},
			getFileOpenMode: {
				useQuery: () => ({ data: "split-pane", isLoading: false }),
			},
			setFileOpenMode: {
				useMutation: () => mutationMock(),
			},
			getShowResourceMonitor: {
				useQuery: () => ({ data: false, isLoading: false }),
			},
			setShowResourceMonitor: {
				useMutation: () => mutationMock(),
			},
			getOpenLinksInApp: {
				useQuery: () => ({ data: false, isLoading: false }),
			},
			setOpenLinksInApp: {
				useMutation: () => mutationMock(),
			},
			getVoiceInputEnabled: {
				useQuery: () => ({ data: voiceInputEnabled, isLoading: false }),
			},
			setVoiceInputEnabled: {
				useMutation: () => ({
					isError: false,
					isPending: false,
					mutate: setVoiceInputEnabledMutateMock,
				}),
			},
		},
	},
}));

function queryUtils<T>(data: T) {
	return {
		cancel: mock(async () => undefined),
		getData: mock(() => data),
		invalidate: mock(() => undefined),
		setData: mock(() => undefined),
	};
}

function mutationMock() {
	return {
		isPending: false,
		mutate: mock(() => undefined),
	};
}

const { BehaviorSettings } = await import("./BehaviorSettings");

function renderBehaviorSettings() {
	voiceToggleHandler = undefined;
	return renderToStaticMarkup(<BehaviorSettings />);
}

describe("BehaviorSettings voice shortcut link", () => {
	beforeEach(() => {
		voiceShortcutText = "⌘⇧V";
		voiceInputEnabled = true;
		voiceToggleHandler = undefined;
		setVoiceInputEnabledMutateMock.mockClear();
	});

	it("displaysEffectiveVoiceShortcutInBehaviorSettings", () => {
		const markup = renderBehaviorSettings();

		expect(markup).toContain("Voice Shortcut");
		expect(markup).toContain("⌘⇧V");
		expect(markup).toContain(
			'href="#/settings/keyboard?shortcut=VOICE_INPUT_TOGGLE"',
		);
	});

	it("reflectsCustomVoiceShortcutOverride", () => {
		voiceShortcutText = "⌘⇧U";

		const markup = renderBehaviorSettings();

		expect(markup).toContain("⌘⇧U");
		expect(markup).not.toContain("⌘⇧V");
	});

	it("handlesUnavailableVoiceShortcutDisplay", () => {
		voiceShortcutText = "Unassigned";

		const markup = renderBehaviorSettings();

		expect(markup).toContain("Shortcut unavailable");
		expect(markup).toContain("Reset in Keyboard Shortcuts");
		expect(markup).toContain('id="voice-input"');
		expect(markup).toContain('role="switch"');

		expect(voiceToggleHandler).toBeFunction();
		voiceToggleHandler?.(false);
		expect(setVoiceInputEnabledMutateMock).toHaveBeenCalledWith({
			enabled: false,
		});
	});
});

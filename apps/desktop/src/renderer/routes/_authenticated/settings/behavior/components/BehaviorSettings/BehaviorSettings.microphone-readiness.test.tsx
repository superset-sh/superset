import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type ToggleHandler = (checked: boolean) => void;
type ClickHandler = () => void;
type MicrophoneStatus = "granted" | "denied" | "promptable" | "unknown";

let microphoneStatus: MicrophoneStatus | undefined = "promptable";
let microphoneStatusLoading = false;
let microphoneActionHandler: ClickHandler | undefined;
let voiceToggleHandler: ToggleHandler | undefined;
let voiceInputEnabled = true;

const permissionsGetStatusInvalidateMock = mock(() => undefined);
const requestMicrophoneMutateMock = mock(() => {
	permissionsGetStatusInvalidateMock();
});
const setVoiceInputEnabledMutateMock = mock((input: { enabled: boolean }) => {
	voiceInputEnabled = input.enabled;
});

mock.module("@superset/ui/button", () => ({
	Button: ({
		children,
		onClick,
	}: {
		children?: ReactNode;
		onClick?: ClickHandler;
	}) => {
		microphoneActionHandler = onClick;

		return (
			<button onClick={onClick} type="button">
				{children}
			</button>
		);
	},
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
	useHotkeyDisplay: () => ({ keys: ["⌘", "⇧", "V"], text: "⌘⇧V" }),
}));

mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		useUtils: () => ({
			permissions: {
				getStatus: {
					invalidate: permissionsGetStatusInvalidateMock,
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
					data: microphoneStatus
						? {
								accessibility: true,
								fullDiskAccess: true,
								microphone: microphoneStatus === "granted",
								microphoneStatus,
							}
						: undefined,
					isLoading: microphoneStatusLoading,
				}),
			},
			requestMicrophone: {
				useMutation: () => ({
					isPending: false,
					mutate: requestMicrophoneMutateMock,
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
	microphoneActionHandler = undefined;
	voiceToggleHandler = undefined;

	return renderToStaticMarkup(<BehaviorSettings />);
}

describe("BehaviorSettings microphone readiness", () => {
	beforeEach(() => {
		microphoneStatus = "promptable";
		microphoneStatusLoading = false;
		voiceInputEnabled = true;
		microphoneActionHandler = undefined;
		voiceToggleHandler = undefined;
		permissionsGetStatusInvalidateMock.mockClear();
		requestMicrophoneMutateMock.mockClear();
		setVoiceInputEnabledMutateMock.mockClear();
	});

	it("rendersMicrophoneReadinessStates", () => {
		const expectations: Array<{
			copy: string;
			status: MicrophoneStatus | undefined;
		}> = [
			{ copy: "Microphone is ready", status: "granted" },
			{ copy: "Microphone access is blocked", status: "denied" },
			{ copy: "Microphone access is needed", status: "promptable" },
			{ copy: "Microphone status is unavailable", status: "unknown" },
			{ copy: "Checking microphone access", status: undefined },
		];

		for (const expectation of expectations) {
			microphoneStatus = expectation.status;
			microphoneStatusLoading = expectation.status === undefined;

			const markup = renderBehaviorSettings();

			expect(markup).toContain("Microphone readiness");
			expect(markup).toContain(expectation.copy);
		}
	});

	it("refreshesReadinessAfterPermissionAction", () => {
		microphoneStatus = "promptable";
		const markup = renderBehaviorSettings();

		expect(markup).toContain("Grant access");
		expect(microphoneActionHandler).toBeFunction();

		microphoneActionHandler?.();

		expect(requestMicrophoneMutateMock).toHaveBeenCalledTimes(1);
		expect(permissionsGetStatusInvalidateMock).toHaveBeenCalledTimes(1);
	});

	it("keepsVoiceSettingsUsableWhenMicrophoneDenied", () => {
		microphoneStatus = "denied";
		const markup = renderBehaviorSettings();

		expect(markup).toContain("Microphone access is blocked");
		expect(markup).toContain("Shortcut");
		expect(markup).toContain("⌘⇧V");
		expect(markup).toContain('id="voice-input"');
		expect(markup).toContain('role="switch"');
		expect(markup).toContain('aria-checked="true"');
		expect(markup).toContain(
			'<button aria-checked="true" aria-describedby="voice-input-status" id="voice-input" role="switch" type="button"></button>',
		);

		expect(voiceToggleHandler).toBeFunction();
		voiceToggleHandler?.(false);
		expect(setVoiceInputEnabledMutateMock).toHaveBeenCalledWith({
			enabled: false,
		});
	});
});

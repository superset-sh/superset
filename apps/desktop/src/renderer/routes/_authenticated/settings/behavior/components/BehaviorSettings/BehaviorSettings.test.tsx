import { beforeEach, describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

type ToggleHandler = (checked: boolean) => void;

let voiceToggleHandler: ToggleHandler | undefined;
let voiceInputEnabled = false;
let voiceInputLoading = false;
let voiceInputMutationPending = false;
let voiceInputMutationError: Error | null = null;

const getVoiceInputEnabledCancelMock = mock(async () => undefined);
const getVoiceInputEnabledGetDataMock = mock(() => voiceInputEnabled);
const getVoiceInputEnabledSetDataMock = mock(
	(_input: undefined, enabled: boolean) => {
		voiceInputEnabled = enabled;
	},
);
const getVoiceInputEnabledInvalidateMock = mock(() => undefined);
const setVoiceInputEnabledMutateMock = mock((input: { enabled: boolean }) => {
	voiceInputEnabled = input.enabled;
});

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

mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		useUtils: () => ({
			settings: {
				getConfirmOnQuit: queryUtils(true),
				getFileOpenMode: queryUtils("split-pane"),
				getOpenLinksInApp: queryUtils(false),
				getShowResourceMonitor: queryUtils(false),
				getVoiceInputEnabled: {
					cancel: getVoiceInputEnabledCancelMock,
					getData: getVoiceInputEnabledGetDataMock,
					setData: getVoiceInputEnabledSetDataMock,
					invalidate: getVoiceInputEnabledInvalidateMock,
				},
			},
		}),
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
				useQuery: () => ({
					data: voiceInputEnabled,
					isLoading: voiceInputLoading,
				}),
			},
			setVoiceInputEnabled: {
				useMutation: () => ({
					error: voiceInputMutationError,
					isError: Boolean(voiceInputMutationError),
					isPending: voiceInputMutationPending,
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
		setData: mock(() => undefined),
		invalidate: mock(() => undefined),
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

describe("BehaviorSettings voice input", () => {
	beforeEach(() => {
		voiceInputEnabled = false;
		voiceInputLoading = false;
		voiceInputMutationPending = false;
		voiceInputMutationError = null;
		voiceToggleHandler = undefined;
		getVoiceInputEnabledCancelMock.mockClear();
		getVoiceInputEnabledGetDataMock.mockClear();
		getVoiceInputEnabledSetDataMock.mockClear();
		getVoiceInputEnabledInvalidateMock.mockClear();
		setVoiceInputEnabledMutateMock.mockClear();
	});

	it("rendersVoiceInputSection", () => {
		const markup = renderBehaviorSettings();

		expect(markup).toContain("Voice Input");
		expect(markup).toContain("Enable voice input");
		expect(markup).toContain('id="voice-input"');
		expect(markup).toContain('role="switch"');
		expect(markup).toContain('aria-checked="false"');
	});

	it("persistsVoiceInputToggle", () => {
		renderBehaviorSettings();

		expect(voiceToggleHandler).toBeFunction();
		voiceToggleHandler?.(true);

		expect(setVoiceInputEnabledMutateMock).toHaveBeenCalledWith({
			enabled: true,
		});

		const markup = renderBehaviorSettings();
		expect(markup).toContain('aria-checked="true"');
	});

	it("preservesExistingBehaviorSettingsDuringVoiceStateChanges", () => {
		voiceInputLoading = true;
		let markup = renderBehaviorSettings();

		expect(markup).toContain("Confirm before quitting");
		expect(markup).toContain("File open mode");
		expect(markup).toContain("Loading voice preference");
		expect(markup).toContain('id="voice-input"');
		expect(markup).toContain("disabled");

		voiceInputLoading = false;
		voiceInputMutationError = new Error("write failed");
		markup = renderBehaviorSettings();

		expect(markup).toContain("Confirm before quitting");
		expect(markup).toContain("Voice preference could not be saved");
	});

	it("omitsVendorCredentialSetupCopy", () => {
		const markup = renderBehaviorSettings().toLowerCase();

		expect(markup).toContain("voice input");

		for (const prohibitedCopy of [
			"api key",
			"account",
			"sdk",
			"provider",
			"wispr flow",
		]) {
			expect(markup).not.toContain(prohibitedCopy);
		}
	});
});

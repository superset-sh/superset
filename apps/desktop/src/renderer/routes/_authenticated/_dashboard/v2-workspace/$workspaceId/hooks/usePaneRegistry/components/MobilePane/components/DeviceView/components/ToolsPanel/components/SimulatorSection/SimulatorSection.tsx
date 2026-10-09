import type { DeviceClient, DeviceSettingKey } from "@expo/hub-client";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { Slider } from "@superset/ui/slider";
import { Switch } from "@superset/ui/switch";
import type { ReactNode } from "react";
import {
	TbAccessible,
	TbBold,
	TbBorderOuter,
	TbColorFilter,
	TbContrast,
	TbDroplet,
	TbDropletHalf2,
	TbKeyboard,
	TbSunMoon,
	TbTextSize,
	TbWifi,
	TbWind,
	TbZoomIn,
} from "react-icons/tb";
import { SettingRow } from "../SettingRow";
import { SettingSelect } from "../SettingSelect";
import { ToolsSection } from "../ToolsSection";

type SettingKey = DeviceSettingKey | "hardware-keyboard";

interface Choice {
	value: string;
	label: MessageDescriptor;
}

type SettingControl =
	| { kind: "select"; choices: Choice[] }
	| { kind: "steps"; values: string[]; androidValues?: string[] }
	| { kind: "switch" };

interface SettingDefinition {
	key: SettingKey;
	label: MessageDescriptor;
	icon: ReactNode;
	control: SettingControl;
}

const ICON = "size-3.5";

const SIZE_STEPS = ["small", "medium", "large", "extra-large"];

const SETTINGS: SettingDefinition[] = [
	{
		key: "appearance",
		label: msg({ message: "Appearance" }),
		icon: <TbSunMoon className={ICON} />,
		control: {
			kind: "select",
			choices: [
				{ value: "light", label: msg({ message: "Light" }) },
				{ value: "dark", label: msg({ message: "Dark" }) },
			],
		},
	},
	{
		key: "network",
		label: msg({ message: "Network" }),
		icon: <TbWifi className={ICON} />,
		control: { kind: "switch" },
	},
	{
		key: "liquid-glass",
		label: msg({ message: "Liquid Glass" }),
		icon: <TbDroplet className={ICON} />,
		control: {
			kind: "select",
			choices: [
				{
					value: "clear",
					label: msg({ message: "Clear", context: "Liquid Glass style" }),
				},
				{ value: "tinted", label: msg({ message: "Tinted" }) },
			],
		},
	},
	{
		key: "color-filter",
		label: msg({ message: "Color Filter" }),
		icon: <TbColorFilter className={ICON} />,
		control: {
			kind: "select",
			choices: [
				{ value: "none", label: msg({ message: "None" }) },
				{
					value: "red-green",
					label: msg({ message: "Red/Green (Protanopia)" }),
				},
				{
					value: "green-red",
					label: msg({ message: "Green/Red (Deuteranopia)" }),
				},
				{
					value: "blue-yellow",
					label: msg({ message: "Blue/Yellow (Tritanopia)" }),
				},
				{ value: "grayscale", label: msg({ message: "Grayscale" }) },
			],
		},
	},
	{
		key: "text-size",
		label: msg({ message: "Text Size" }),
		icon: <TbTextSize className={ICON} />,
		control: {
			kind: "steps",
			values: [
				"extra-small",
				"small",
				"medium",
				"large",
				"extra-large",
				"extra-extra-large",
				"extra-extra-extra-large",
			],
			androidValues: SIZE_STEPS,
		},
	},
	{
		key: "display-size",
		label: msg({ message: "Display Size" }),
		icon: <TbZoomIn className={ICON} />,
		control: { kind: "steps", values: SIZE_STEPS },
	},
	{
		key: "hardware-keyboard",
		label: msg({ message: "Hardware Keyboard" }),
		icon: <TbKeyboard className={ICON} />,
		control: { kind: "switch" },
	},
	{
		key: "onscreen-keyboard",
		label: msg({ message: "On-screen Keyboard" }),
		icon: <TbKeyboard className={ICON} />,
		control: { kind: "switch" },
	},
	{
		key: "reduce-motion",
		label: msg({ message: "Reduce Motion" }),
		icon: <TbWind className={ICON} />,
		control: { kind: "switch" },
	},
	{
		key: "bold-text",
		label: msg({ message: "Bold Text" }),
		icon: <TbBold className={ICON} />,
		control: { kind: "switch" },
	},
	{
		key: "increase-contrast",
		label: msg({ message: "Increase Contrast" }),
		icon: <TbContrast className={ICON} />,
		control: { kind: "switch" },
	},
	{
		key: "show-borders",
		label: msg({ message: "Show Borders" }),
		icon: <TbBorderOuter className={ICON} />,
		control: { kind: "switch" },
	},
	{
		key: "reduce-transparency",
		label: msg({ message: "Reduce Transparency" }),
		icon: <TbDropletHalf2 className={ICON} />,
		control: { kind: "switch" },
	},
	{
		key: "voiceover",
		label: msg({ message: "VoiceOver" }),
		icon: <TbAccessible className={ICON} />,
		control: { kind: "switch" },
	},
];

interface SimulatorSectionProps {
	client: DeviceClient;
}

export function SimulatorSection({ client }: SimulatorSectionProps) {
	const settings = client.deviceSettings as Partial<
		Record<SettingKey, string>
	> | null;
	const available = SETTINGS.filter(({ key }) => settings?.[key] !== undefined);
	const set = (key: SettingKey, value: string) =>
		client.setDeviceSetting(key as DeviceSettingKey, value);

	return (
		<ToolsSection
			title={
				client.platform === "ios" ? (
					<Trans>Simulator</Trans>
				) : (
					<Trans>Emulator</Trans>
				)
			}
			defaultOpen
		>
			{available.length === 0 ? (
				<div className="py-2 text-center text-xs text-muted-foreground">
					<Trans>Settings are not available for this device</Trans>
				</div>
			) : (
				<div className="flex flex-col gap-1.5">
					{available.map(({ key, label, icon, control }) => {
						const value = settings?.[key] ?? "";
						const pending = client.deviceSettingsPending.has(
							key as DeviceSettingKey,
						);
						const name = i18n._(label);
						const steps =
							control.kind !== "steps"
								? []
								: client.platform === "android" && control.androidValues
									? control.androidValues
									: control.values;
						return (
							<SettingRow key={key} icon={icon} label={name}>
								{control.kind === "switch" && (
									<Switch
										aria-label={name}
										checked={value === "on"}
										disabled={pending}
										onCheckedChange={(checked) =>
											set(key, checked ? "on" : "off")
										}
									/>
								)}
								{control.kind === "select" && (
									<SettingSelect
										label={name}
										value={value}
										disabled={pending}
										options={control.choices.map((choice) => ({
											value: choice.value,
											label: i18n._(choice.label),
										}))}
										onChange={(next) => set(key, next)}
									/>
								)}
								{control.kind === "steps" && (
									<Slider
										aria-label={name}
										className="w-28"
										min={0}
										max={steps.length - 1}
										step={1}
										disabled={pending}
										value={[Math.max(0, steps.indexOf(value))]}
										onValueChange={([index]) => {
											const next = steps[index ?? 0];
											if (next && next !== value) set(key, next);
										}}
									/>
								)}
							</SettingRow>
						);
					})}
				</div>
			)}
		</ToolsSection>
	);
}

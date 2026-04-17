import { useMemo } from "react";
import { formatHotkeyDisplay } from "../../display";
import { PLATFORM } from "../../registry";
import type { HotkeyDisplay } from "../../types";
import { useBinding } from "../useBinding";

export function useHotkeyDisplay(id: string): HotkeyDisplay {
	const binding = useBinding(id as Parameters<typeof useBinding>[0]);
	return useMemo(() => formatHotkeyDisplay(binding, PLATFORM), [binding]);
}

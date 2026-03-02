import { Toaster } from "@superset/ui/sonner";
import { useTheme } from "renderer/stores/theme/store";

export function ThemedToaster() {
	const theme = useTheme();
	return <Toaster expand theme={theme?.type ?? "dark"} />;
}

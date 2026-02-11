import { useUniwind } from "uniwind";
import { THEME } from "@/lib/theme";

export function useTheme() {
	const { theme } = useUniwind();
	return THEME[theme];
}

import { useTheme } from "@/hooks/useTheme";
import { ClaudeLogo } from "@/screens/(authenticated)/(home)/components/ClaudeLogo";
import { OpenAILogo } from "./components/OpenAILogo";

export function ProviderLogo({
	provider,
	size = 18,
}: {
	provider: string;
	size?: number;
}) {
	const theme = useTheme();
	if (provider === "Anthropic") return <ClaudeLogo size={size} />;
	if (provider === "OpenAI")
		return <OpenAILogo size={size} color={theme.foreground} />;
	return null;
}

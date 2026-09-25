import { useLingui } from "@lingui/react/macro";
import { useColorScheme, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import type { ButtonProps } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type SocialProvider = "apple" | "github" | "google";

export interface SocialButtonProps extends Omit<ButtonProps, "children"> {
	provider: SocialProvider;
}

function AppleIcon({ color }: { color: string }) {
	// simple-icons "apple": normalized to fill the 24-grid like the GitHub mark.
	return (
		<Svg width={20} height={20} viewBox="0 0 24 24">
			<Path
				d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
				fill={color}
			/>
		</Svg>
	);
}

function GithubIcon({ color }: { color: string }) {
	return (
		<Svg width={20} height={20} viewBox="0 0 24 24">
			<Path
				d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
				fill={color}
			/>
		</Svg>
	);
}

function GoogleIcon() {
	return (
		<Svg width={20} height={20} viewBox="0 0 24 24">
			<Path
				d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
				fill="#4285F4"
			/>
			<Path
				d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
				fill="#34A853"
			/>
			<Path
				d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
				fill="#FBBC05"
			/>
			<Path
				d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
				fill="#EA4335"
			/>
		</Svg>
	);
}

const PROVIDER_NAME: Record<SocialProvider, string> = {
	apple: "Apple",
	github: "GitHub",
	google: "Google",
};

export function SocialButton({
	provider,
	className,
	...props
}: SocialButtonProps) {
	const { t } = useLingui();
	const colorScheme = useColorScheme();
	const iconColor = colorScheme === "dark" ? "white" : "black";

	return (
		<Button
			variant="outline"
			size="lg"
			className={cn("flex flex-row gap-x-2", className)}
			{...props}
		>
			<View className="w-5 items-center">
				{provider === "apple" ? (
					<AppleIcon color={iconColor} />
				) : provider === "github" ? (
					<GithubIcon color={iconColor} />
				) : (
					<GoogleIcon />
				)}
			</View>
			<Text className="flex-1 max-w-36 text-center">
				{t({
					message: `Continue with ${PROVIDER_NAME[provider]}`,
				})}
			</Text>
		</Button>
	);
}

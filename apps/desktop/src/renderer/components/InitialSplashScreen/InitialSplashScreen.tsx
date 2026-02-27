import { Spinner } from "@superset/ui/spinner";
import { SupersetLogo } from "renderer/routes/sign-in/components/SupersetLogo";
import { TypewriterText } from "./components/TypewriterText";

export function InitialSplashScreen() {
	return (
		<div className="flex h-screen w-screen items-center justify-center bg-background">
			<div className="flex max-w-xl flex-col items-center gap-6 px-6 text-center">
				<SupersetLogo className="h-10 w-auto opacity-90" />

				<h1 className="text-lg font-medium tracking-tight text-foreground">
					<TypewriterText
						segments={[
							{ text: "The Code Editor for " },
							{ text: "AI Agents.", className: "font-semibold" },
						]}
						speed={40}
						delay={300}
					/>
				</h1>

				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Spinner className="size-4" />
					<span>Loading...</span>
				</div>
			</div>
		</div>
	);
}

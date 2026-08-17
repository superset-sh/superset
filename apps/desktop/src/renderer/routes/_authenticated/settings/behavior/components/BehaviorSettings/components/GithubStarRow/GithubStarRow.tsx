import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { ExternalLink, Star } from "lucide-react";
import { useGithubStarAction } from "renderer/hooks/useGithubStarAction";
import { track } from "renderer/lib/analytics";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";

interface GithubStarRowProps {
	searchQuery: string;
}

export function GithubStarRow({ searchQuery }: GithubStarRowProps) {
	// A status row the user navigated to specifically to check, not an
	// ambient surface — worth a fresh check on every visit rather than
	// trusting up to 10 minutes of staleness.
	const { state, activate, isBusy } = useGithubStarAction({
		alwaysFreshOnMount: true,
	});

	function handleClick() {
		track(state === "unknown" ? "star_nag_opened_web" : "star_nag_starred", {
			surface: "settings",
		});
		activate();
	}

	return (
		<div className="flex items-center justify-between">
			<div className="space-y-0.5">
				<Label className="text-sm font-medium">
					<HighlightText text="Star Superset on GitHub" query={searchQuery} />
				</Label>
				<p className="text-xs text-muted-foreground">
					Support the project with a GitHub star
				</p>
			</div>
			{state === "starred" ? (
				<span className="text-xs text-muted-foreground">
					Starred — thank you!
				</span>
			) : (
				<Button
					variant="outline"
					size="sm"
					onClick={handleClick}
					disabled={state === "loading" || isBusy}
				>
					{state === "unknown" ? (
						<ExternalLink className="size-3.5" />
					) : (
						<Star className="size-3.5" />
					)}
					{state === "unknown" ? "Open GitHub" : "Star"}
				</Button>
			)}
		</div>
	);
}

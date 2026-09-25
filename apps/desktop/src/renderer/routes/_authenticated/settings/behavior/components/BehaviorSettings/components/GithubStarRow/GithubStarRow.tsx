import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Star } from "lucide-react";
import {
	canActivateStarAction,
	useGithubStarAction,
} from "renderer/hooks/useGithubStarAction";
import { track } from "renderer/lib/analytics";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";

interface GithubStarRowProps {
	searchQuery: string;
}

export function GithubStarRow({ searchQuery }: GithubStarRowProps) {
	const { t } = useLingui();
	// A status row the user navigated to specifically to check, not an
	// ambient surface — worth a fresh check on every visit rather than
	// trusting up to 10 minutes of staleness.
	const { state, activate, isBusy } = useGithubStarAction({
		alwaysFreshOnMount: true,
	});

	function handleClick() {
		track("star_nag_starred", { surface: "settings" });
		activate();
	}

	return (
		<div className="flex items-center justify-between">
			<div className="space-y-0.5">
				<Label className="text-sm font-medium">
					<HighlightText
						text={t({
							message: "Star Superset on GitHub",
						})}
						query={searchQuery}
					/>
				</Label>
				<p className="text-xs text-muted-foreground">
					<Trans>Support the project with a GitHub star</Trans>
				</p>
			</div>
			{state === "starred" ? (
				<span className="text-xs text-muted-foreground">
					<Trans>Starred — thank you!</Trans>
				</span>
			) : state === "unknown" ? (
				// A disabled shadcn Button has pointer-events-none baked into its
				// base classes, so a `title` attribute on the button itself would
				// never receive the hover needed to show it — wrap it (same pattern
				// as DeleteProjectSection) so the tooltip trigger sits outside the
				// disabled element.
				<Tooltip>
					<TooltipTrigger asChild>
						<span>
							<Button variant="outline" size="sm" disabled>
								<Star className="size-3.5" />
								<Trans>Star</Trans>
							</Button>
						</span>
					</TooltipTrigger>
					<TooltipContent side="left">
						<Trans>
							Couldn't confirm star status — check that the GitHub CLI (`gh`) is
							installed, signed in, and that you have a network connection
						</Trans>
					</TooltipContent>
				</Tooltip>
			) : (
				<Button
					variant="outline"
					size="sm"
					onClick={handleClick}
					disabled={!canActivateStarAction(state) || isBusy}
				>
					<Star className="size-3.5" />
					<Trans>Star</Trans>
				</Button>
			)}
		</div>
	);
}

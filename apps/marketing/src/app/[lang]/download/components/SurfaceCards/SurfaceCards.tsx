"use client";

import { Trans } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import { HiMiniArrowRight } from "react-icons/hi2";
import { CliMock } from "../CliMock";
import { CopyCommand } from "../CopyCommand";
import { DesktopDownloadButton } from "../DesktopDownloadButton";
import { DesktopMock } from "../DesktopMock";
import { MobileMock } from "../MobileMock";

const CLI_INSTALL_COMMAND = `curl -fsSL ${COMPANY.MARKETING_URL}/cli/install.sh | sh`;
// `/cli` itself has no index page; getting-started is the entry point
const CLI_DOCS_URL = `${COMPANY.DOCS_URL}/cli/getting-started`;

// Each card's visual is drawn in code rather than captured. A screenshot on an
// evergreen page pins a version number, a shell prompt and somebody's real
// worktree paths into a page that outlives all three.
// One treatment for all three bands: same inset, same inner surface, so the
// card cell is the only frame and the mocks read as a set.
const CARD_BAND_CLASS =
	"relative aspect-[16/10] overflow-hidden border-border border-b bg-[#0d0d0d] p-4";
// Equal copy block keeps the three action rows on one line
const CARD_BODY_CLASS = "flex flex-1 flex-col p-6";
const CARD_COPY_CLASS =
	"mt-2 min-h-[4.5rem] text-muted-foreground text-sm leading-relaxed";
const CARD_ACTION_CLASS = "mt-5 flex min-h-10 w-full items-start";

export function SurfaceCards() {
	return (
		<section className="border-border border-t pt-12 sm:pt-16">
			<h2 className="font-mono text-brand text-xs uppercase tracking-wider">
				<Trans>Every surface</Trans>
			</h2>
			<p className="mt-3 max-w-2xl font-light text-foreground text-xl sm:text-2xl">
				<Trans>
					Run your agents from the desktop, any terminal, or your phone.
				</Trans>
			</p>

			<div className="mt-8 grid grid-cols-1 gap-px border border-border bg-border md:grid-cols-3">
				<article className="flex flex-col bg-background transition-colors hover:bg-muted/10">
					<div className={CARD_BAND_CLASS}>
						<DesktopMock />
					</div>
					<div className={CARD_BODY_CLASS}>
						<h3 className="font-medium text-base text-foreground">
							<Trans>Desktop</Trans>
						</h3>
						<p className={CARD_COPY_CLASS}>
							<Trans>
								The full workspace. Run agents in parallel, keep each one in its
								own worktree, and review every change before it lands.
							</Trans>
						</p>
						<div className={CARD_ACTION_CLASS}>
							<DesktopDownloadButton />
						</div>
					</div>
				</article>

				<article className="flex flex-col bg-background transition-colors hover:bg-muted/10">
					<div className={CARD_BAND_CLASS}>
						<CliMock />
					</div>
					<div className={CARD_BODY_CLASS}>
						<h3 className="font-medium text-base text-foreground">
							<Trans>CLI</Trans>
						</h3>
						<p className={CARD_COPY_CLASS}>
							<Trans>
								Create workspaces, launch agents, and read their output from any
								terminal or script. macOS and Linux.
							</Trans>
						</p>
						<div
							className={`${CARD_ACTION_CLASS} min-w-0 flex-col items-stretch gap-2`}
						>
							<CopyCommand command={CLI_INSTALL_COMMAND} source="cli_install" />
							<a
								href={CLI_DOCS_URL}
								className="inline-flex items-center gap-1 text-muted-foreground text-xs transition-colors hover:text-foreground"
							>
								<Trans>CLI reference</Trans>
								<HiMiniArrowRight className="size-3" />
							</a>
						</div>
					</div>
				</article>

				<article className="flex flex-col bg-background transition-colors hover:bg-muted/10">
					<div className={CARD_BAND_CLASS}>
						<MobileMock />
					</div>
					<div className={CARD_BODY_CLASS}>
						<h3 className="flex items-center gap-2 font-medium text-base text-foreground">
							<Trans>Mobile</Trans>
							<span className="rounded-[2px] border border-border px-2 py-0.5 font-mono font-normal text-muted-foreground text-xs">
								<Trans>Coming soon</Trans>
							</span>
						</h3>
						<p className={CARD_COPY_CLASS}>
							<Trans>
								Check on running agents and read what they changed from your
								phone.
							</Trans>
						</p>
					</div>
				</article>
			</div>
		</section>
	);
}

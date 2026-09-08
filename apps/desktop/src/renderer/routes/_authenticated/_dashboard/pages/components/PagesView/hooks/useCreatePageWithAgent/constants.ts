// Agent instructions, not interface copy. Claude plugins use superset:page;
// managed skill directories expose the same skill as superset-page.
export const PAGE_AGENT_PROMPT = `Help me create and publish a Superset Page using the Superset Pages skill.

First load and follow the Pages skill: superset:page in the Superset plugin, or superset-page in your available skills. Read its SKILL.md before creating content. If neither name is available, look for the installed Superset Pages skill; if it is missing, explain that setup is needed instead of substituting a generic HTML workflow.

Explain briefly that you will publish a page my teammates can open and comment on, then ask what I want to create and who it is for. Examples include a design doc, report, or proposal. Gather any source material needed.

Before building, run superset pages --help and superset auth whoami to check that the CLI supports Pages and is authenticated. Follow the skill's content policy and design guidance. Keep the source inside this workspace and verify it renders correctly.

Publish with superset pages publish, following the skill's instructions. Creating an HTML file or opening a local preview does not complete this task. Only report it as published after the command succeeds and returns a page URL. Verify that the publish result reports watching: true for this agent session; if not, explain that comment delivery is not active and what needs fixing.

Return the published link and explain how teammates can pin comments to the page. When feedback arrives, update the source, republish to the same page, reply with what changed, and resolve only the threads you addressed. If authentication, upload, or watching fails, report the failing command and actual error clearly; do not claim the page or feedback loop is ready.`;

import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-static";

const SKILL_PATH = path.join(process.cwd(), "../../skills/superset/SKILL.md");

export function GET() {
	const content = fs.readFileSync(SKILL_PATH, "utf-8");
	return new Response(content, {
		headers: { "content-type": "text/markdown; charset=utf-8" },
	});
}

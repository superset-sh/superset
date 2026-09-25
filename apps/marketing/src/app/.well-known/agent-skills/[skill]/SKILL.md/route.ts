import { fetchSkill, isSkillName } from "../../skills-source";

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ skill: string }> },
) {
	const { skill } = await params;
	if (!isSkillName(skill)) {
		return new Response("Not found", { status: 404 });
	}
	const content = await fetchSkill(skill);
	if (!content) {
		return new Response("Skill source unavailable", { status: 503 });
	}
	return new Response(content, {
		headers: {
			"content-type": "text/markdown; charset=utf-8",
			"Cache-Control": "public, max-age=3600, s-maxage=3600",
		},
	});
}

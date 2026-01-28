import { z } from "zod";
import { publicProcedure, router } from "../../..";
import { secureFs } from "../../changes/security/secure-fs";

export const createDetectExpoProcedures = () => {
	return router({
		detectExpo: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
			.query(async ({ input }) => {
				try {
					const content = await secureFs.readFile(
						input.worktreePath,
						"package.json",
					);
					const packageJson = JSON.parse(content);
					const hasExpo = !!(
						packageJson.dependencies?.expo ||
						packageJson.devDependencies?.expo
					);
					return { hasExpo };
				} catch {
					return { hasExpo: false };
				}
			}),
	});
};

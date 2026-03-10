import { registerTools, getToolsForAgent, getAllToolNames } from "./tool-registry";
import { boardTools } from "./board.tools";
import { communityTools } from "./community.tools";
import { contentStudioTools } from "./content-studio.tools";
import { fileTools } from "./file.tools";
import { userTools } from "./user.tools";
import { imageGenerationTools } from "./image-generation";
import { personalColorTools } from "./personal-color";

// 모든 도구 등록
registerTools(boardTools);
registerTools(communityTools);
registerTools(contentStudioTools);
registerTools(fileTools);
registerTools(userTools);
registerTools(imageGenerationTools);
registerTools(personalColorTools);

export { getToolsForAgent, getAllToolNames };

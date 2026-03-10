/**
 * Story Studio tRPC Router
 *
 * 6개 서브 라우터: project, chapter, graph, flag, dialogue, character
 */
import { authProcedure, createServiceContainer, getAuthUserId, router, type BaseTRPCContext } from "../../../core/trpc";
import { z } from "zod";
import type { BeatService } from "../service/beat.service";
import type { ChapterService } from "../service/chapter.service";
import type { CharacterService } from "../service/character.service";
import type { DialogueService } from "../service/dialogue.service";
import type { EndingService } from "../service/ending.service";
import type { EventService } from "../service/event.service";
import type { ExportService } from "../service/export.service";
import type { FlagService } from "../service/flag.service";
import type { GraphService } from "../service/graph.service";
import type { ProjectService } from "../service/project.service";
import type { ValidationService } from "../service/validation.service";

// ============================================================================
// Shared Zod Schemas (Condition / Effect)
// ============================================================================

/** 재귀적 조건 트리 — flag_check 또는 AND/OR 그룹 */
const conditionSchema: z.ZodType<{
  type: "flag_check" | "group";
  flagId?: string;
  operator?: "==" | "!=" | ">" | ">=" | "<" | "<=";
  value?: string | number | boolean;
  logic?: "AND" | "OR";
  children?: unknown[];
}> = z.object({
  type: z.enum(["flag_check", "group"]),
  flagId: z.string().uuid().optional(),
  operator: z.enum(["==", "!=", ">", ">=", "<", "<="]).optional(),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  logic: z.enum(["AND", "OR"]).optional(),
  children: z.lazy(() => z.array(conditionSchema)).optional(),
});

/** 플래그 변경 효과 */
const effectSchema = z.object({
  flagId: z.string().uuid(),
  operation: z.enum(["set", "add", "subtract", "toggle", "multiply"]),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

// ============================================================================
// Zod Input Schemas
// ============================================================================

const createProjectSchema = z.object({
  title: z.string().min(1).max(200),
  genre: z.string().max(50).optional(),
  description: z.string().max(2000).optional(),
});

const updateProjectSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  genre: z.string().max(50).optional(),
  description: z.string().max(2000).optional(),
  status: z.string().optional(),
});

const createChapterSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(200),
  code: z.string().min(1).max(50),
  order: z.number().int().min(0).optional(),
  summary: z.string().max(2000).optional(),
});

const updateChapterSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  code: z.string().min(1).max(50).optional(),
  order: z.number().int().min(0).optional(),
  summary: z.string().max(2000).optional(),
  status: z.string().optional(),
  estimatedPlaytime: z.string().optional(),
});

const createGraphNodeSchema = z.object({
  projectId: z.string().uuid(),
  chapterId: z.string().uuid(),
  type: z.string().min(1),
  code: z.string().min(1).max(50),
  label: z.string().min(1).max(200),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateGraphNodeSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  code: z.string().min(1).max(50).optional(),
  type: z.string().optional(),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const createGraphEdgeSchema = z.object({
  projectId: z.string().uuid(),
  chapterId: z.string().uuid(),
  sourceNodeId: z.string().uuid(),
  targetNodeId: z.string().uuid(),
  label: z.string().max(200).optional(),
  conditions: z.array(conditionSchema).optional(),
  effects: z.array(effectSchema).optional(),
});

const updateGraphEdgeSchema = z.object({
  label: z.string().max(200).optional(),
  conditions: z.array(conditionSchema).optional(),
  effects: z.array(effectSchema).optional(),
  order: z.number().int().optional(),
});

const createFlagSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(100),
  type: z.string().optional(),
  defaultValue: z.string().optional(),
  category: z.string().optional(),
  description: z.string().max(1000).optional(),
  isInterpolatable: z.boolean().optional(),
});

const updateFlagSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.string().optional(),
  defaultValue: z.string().optional(),
  category: z.string().optional(),
  description: z.string().max(1000).optional(),
  isInterpolatable: z.boolean().optional(),
});

const createDialogueSchema = z.object({
  projectId: z.string().uuid(),
  chapterId: z.string().uuid(),
  branchNodeId: z.string().uuid(),
  type: z.string().optional(),
  speakerId: z.string().uuid().optional(),
  emotion: z.string().optional(),
  content: z.string().default(""),
  direction: z.string().optional(),
  timing: z.string().optional(),
  voiceNote: z.string().optional(),
  tags: z.array(z.string()).optional(),
  order: z.number().int().min(0).optional(),
});

const updateDialogueSchema = z.object({
  type: z.string().optional(),
  speakerId: z.string().uuid().optional(),
  emotion: z.string().optional(),
  content: z.string().optional(),
  direction: z.string().optional(),
  timing: z.string().optional(),
  voiceNote: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const createCharacterSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(50),
  role: z.string().optional(),
  personality: z.string().max(2000).optional(),
  speechStyle: z.string().max(1000).optional(),
});

const updateCharacterSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  code: z.string().min(1).max(50).optional(),
  role: z.string().optional(),
  personality: z.string().max(2000).optional(),
  speechStyle: z.string().max(1000).optional(),
});

// --- Phase 1 Schemas ---

const createBeatSchema = z.object({
  projectId: z.string().uuid(),
  chapterId: z.string().uuid(),
  title: z.string().min(1).max(200),
  act: z.string().optional(),
  beatType: z.string().optional(),
  summary: z.string().max(2000).optional(),
  emotionalTone: z.string().optional(),
  characters: z.array(z.string()).optional(),
  location: z.string().max(200).optional(),
  purpose: z.string().max(2000).optional(),
  linkedNodes: z.array(z.string()).optional(),
  order: z.number().int().min(0).optional(),
});

const updateBeatSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  act: z.string().optional(),
  beatType: z.string().optional(),
  summary: z.string().max(2000).optional(),
  emotionalTone: z.string().optional(),
  characters: z.array(z.string()).optional(),
  location: z.string().max(200).optional(),
  purpose: z.string().max(2000).optional(),
  linkedNodes: z.array(z.string()).optional(),
  order: z.number().int().min(0).optional(),
});

const createBeatTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  structure: z.string().min(1),
  beats: z
    .array(
      z.object({
        beatType: z.string(),
        act: z.string(),
        label: z.string(),
        description: z.string(),
      }),
    )
    .optional(),
  isBuiltIn: z.boolean().optional(),
});

const updateBeatTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  structure: z.string().optional(),
  beats: z
    .array(
      z.object({
        beatType: z.string(),
        act: z.string(),
        label: z.string(),
        description: z.string(),
      }),
    )
    .optional(),
});

const createEndingSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(200),
  type: z.string().optional(),
  description: z.string().max(2000).optional(),
  requiredFlags: z.array(conditionSchema).optional(),
  graphNodeId: z.string().uuid().optional(),
  difficulty: z.string().optional(),
  discoveryHint: z.string().max(2000).optional(),
});

const updateEndingSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  type: z.string().optional(),
  description: z.string().max(2000).optional(),
  requiredFlags: z.array(conditionSchema).optional(),
  graphNodeId: z.string().uuid().optional(),
  difficulty: z.string().optional(),
  discoveryHint: z.string().max(2000).optional(),
});

const createEventSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(200),
  type: z.string().optional(),
  description: z.string().max(2000).optional(),
  effects: z.array(effectSchema).optional(),
  triggeredNodes: z.array(z.string()).optional(),
});

const updateEventSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: z.string().optional(),
  description: z.string().max(2000).optional(),
  effects: z.array(effectSchema).optional(),
  triggeredNodes: z.array(z.string()).optional(),
});

// ============================================================================
// Service Container
// ============================================================================

const services = createServiceContainer<{
  projectService: ProjectService;
  chapterService: ChapterService;
  graphService: GraphService;
  flagService: FlagService;
  dialogueService: DialogueService;
  characterService: CharacterService;
  exportService: ExportService;
  validationService: ValidationService;
  beatService: BeatService;
  endingService: EndingService;
  eventService: EventService;
}>();

export const injectStoryStudioServices = services.inject;

// ============================================================================
// Router
// ============================================================================

export const storyStudioRouter = router({
  // ========================================
  // Project Routes
  // ========================================

  project: router({
    /** 프로젝트 목록 조회 */
    list: authProcedure.query(async ({ ctx }) => {
      const userId = getAuthUserId(ctx);
      return services.get().projectService.findAll(userId);
    }),

    /** 프로젝트 상세 조회 */
    byId: authProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ input }: { input: { id: string } }) => {
      return services.get().projectService.findById(input.id);
    }),

    /** 프로젝트 생성 */
    create: authProcedure.input(createProjectSchema).mutation(async ({ input, ctx }: { input: z.infer<typeof createProjectSchema>; ctx: BaseTRPCContext }) => {
      const userId = getAuthUserId(ctx);
      return services.get().projectService.create(input, userId);
    }),

    /** 프로젝트 수정 */
    update: authProcedure
      .input(z.object({ id: z.string().uuid(), data: updateProjectSchema }))
      .mutation(async ({ input }: { input: { id: string; data: z.infer<typeof updateProjectSchema> } }) => {
        return services.get().projectService.update(input.id, input.data);
      }),

    /** 프로젝트 삭제 */
    delete: authProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ input }: { input: { id: string } }) => {
      return services.get().projectService.delete(input.id);
    }),

    /** 프로젝트 전체 데이터 JSON 내보내기 */
    export: authProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ input }: { input: { id: string } }) => {
      return services.get().exportService.exportProject(input.id);
    }),

    /** 프로젝트 그래프 검증 */
    validate: authProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ input }: { input: { id: string } }) => {
      return services.get().validationService.validateProject(input.id);
    }),
  }),

  // ========================================
  // Chapter Routes
  // ========================================

  chapter: router({
    /** 프로젝트별 챕터 목록 */
    byProject: authProcedure
      .input(z.object({ projectId: z.string().uuid() }))
      .query(async ({ input }: { input: { projectId: string } }) => {
        return services.get().chapterService.findByProject(input.projectId);
      }),

    /** 챕터 상세 조회 */
    byId: authProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ input }: { input: { id: string } }) => {
      return services.get().chapterService.findById(input.id);
    }),

    /** 챕터 생성 */
    create: authProcedure.input(createChapterSchema).mutation(async ({ input }: { input: z.infer<typeof createChapterSchema> }) => {
      const { projectId, ...rest } = input;
      return services.get().chapterService.create(rest, projectId);
    }),

    /** 챕터 수정 */
    update: authProcedure
      .input(z.object({ id: z.string().uuid(), data: updateChapterSchema }))
      .mutation(async ({ input }: { input: { id: string; data: z.infer<typeof updateChapterSchema> } }) => {
        return services.get().chapterService.update(input.id, input.data);
      }),

    /** 챕터 순서 변경 */
    reorder: authProcedure
      .input(
        z.object({
          projectId: z.string().uuid(),
          ids: z.array(z.string().uuid()),
        }),
      )
      .mutation(async ({ input }: { input: { projectId: string; ids: string[] } }) => {
        return services.get().chapterService.reorder(input.projectId, input.ids);
      }),

    /** 챕터 삭제 */
    delete: authProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ input }: { input: { id: string } }) => {
      return services.get().chapterService.delete(input.id);
    }),
  }),

  // ========================================
  // Graph Routes
  // ========================================

  graph: router({
    /** 챕터별 그래프 조회 (노드 + 엣지) */
    byChapter: authProcedure
      .input(z.object({ chapterId: z.string().uuid() }))
      .query(async ({ input }: { input: { chapterId: string } }) => {
        return services.get().graphService.getGraph(input.chapterId);
      }),

    /** 노드 생성 */
    createNode: authProcedure.input(createGraphNodeSchema).mutation(async ({ input }: { input: z.infer<typeof createGraphNodeSchema> }) => {
      return services.get().graphService.createNode(input);
    }),

    /** 노드 수정 */
    updateNode: authProcedure
      .input(z.object({ id: z.string().uuid(), data: updateGraphNodeSchema }))
      .mutation(async ({ input }: { input: { id: string; data: z.infer<typeof updateGraphNodeSchema> } }) => {
        return services.get().graphService.updateNode(input.id, input.data);
      }),

    /** 노드 삭제 */
    deleteNode: authProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ input }: { input: { id: string } }) => {
        return services.get().graphService.deleteNode(input.id);
      }),

    /** 엣지 생성 */
    createEdge: authProcedure.input(createGraphEdgeSchema).mutation(async ({ input }: { input: z.infer<typeof createGraphEdgeSchema> }) => {
      return services.get().graphService.createEdge(input);
    }),

    /** 엣지 수정 */
    updateEdge: authProcedure
      .input(z.object({ id: z.string().uuid(), data: updateGraphEdgeSchema }))
      .mutation(async ({ input }: { input: { id: string; data: z.infer<typeof updateGraphEdgeSchema> } }) => {
        return services.get().graphService.updateEdge(input.id, input.data);
      }),

    /** 엣지 삭제 */
    deleteEdge: authProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ input }: { input: { id: string } }) => {
        return services.get().graphService.deleteEdge(input.id);
      }),

    /** 노드 위치 일괄 업데이트 */
    updateNodePositions: authProcedure
      .input(
        z.object({
          updates: z.array(
            z.object({
              id: z.string().uuid(),
              positionX: z.number(),
              positionY: z.number(),
            }),
          ),
        }),
      )
      .mutation(async ({ input }: { input: { updates: { id: string; positionX: number; positionY: number }[] } }) => {
        return services.get().graphService.updateNodePositions(input.updates);
      }),

    /** 씬 노드 요약 정보 (대사 수, 캐릭터, 감정) */
    getNodeSummaries: authProcedure
      .input(z.object({ chapterId: z.string().uuid() }))
      .query(async ({ input }: { input: { chapterId: string } }) => {
        return services.get().graphService.getNodeSummaries(input.chapterId);
      }),
  }),

  // ========================================
  // Flag Routes
  // ========================================

  flag: router({
    /** 프로젝트별 플래그 목록 */
    byProject: authProcedure
      .input(z.object({ projectId: z.string().uuid() }))
      .query(async ({ input }: { input: { projectId: string } }) => {
        return services.get().flagService.findByProject(input.projectId);
      }),

    /** 플래그 상세 조회 */
    byId: authProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ input }: { input: { id: string } }) => {
      return services.get().flagService.findById(input.id);
    }),

    /** 플래그 생성 */
    create: authProcedure.input(createFlagSchema).mutation(async ({ input }: { input: z.infer<typeof createFlagSchema> }) => {
      return services.get().flagService.create(input);
    }),

    /** 플래그 수정 */
    update: authProcedure
      .input(z.object({ id: z.string().uuid(), data: updateFlagSchema }))
      .mutation(async ({ input }: { input: { id: string; data: z.infer<typeof updateFlagSchema> } }) => {
        return services.get().flagService.update(input.id, input.data);
      }),

    /** 플래그 삭제 */
    delete: authProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ input }: { input: { id: string } }) => {
      return services.get().flagService.delete(input.id);
    }),
  }),

  // ========================================
  // Dialogue Routes
  // ========================================

  dialogue: router({
    /** 노드별 대사 목록 */
    byNode: authProcedure
      .input(z.object({ branchNodeId: z.string().uuid() }))
      .query(async ({ input }: { input: { branchNodeId: string } }) => {
        return services.get().dialogueService.findByNode(input.branchNodeId);
      }),

    /** 대사 상세 조회 */
    byId: authProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ input }: { input: { id: string } }) => {
      return services.get().dialogueService.findById(input.id);
    }),

    /** 대사 생성 */
    create: authProcedure.input(createDialogueSchema).mutation(async ({ input }: { input: z.infer<typeof createDialogueSchema> }) => {
      return services.get().dialogueService.create(input);
    }),

    /** 대사 수정 */
    update: authProcedure
      .input(z.object({ id: z.string().uuid(), data: updateDialogueSchema }))
      .mutation(async ({ input }: { input: { id: string; data: z.infer<typeof updateDialogueSchema> } }) => {
        return services.get().dialogueService.update(input.id, input.data);
      }),

    /** 대사 순서 변경 */
    reorder: authProcedure
      .input(
        z.object({
          nodeId: z.string().uuid(),
          ids: z.array(z.string().uuid()),
        }),
      )
      .mutation(async ({ input }: { input: { nodeId: string; ids: string[] } }) => {
        return services.get().dialogueService.reorder(input.nodeId, input.ids);
      }),

    /** 대사 삭제 */
    delete: authProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ input }: { input: { id: string } }) => {
      return services.get().dialogueService.delete(input.id);
    }),

    /** 대사 일괄 생성 */
    bulkCreate: authProcedure
      .input(
        z.object({
          nodeId: z.string().uuid(),
          lines: z.array(
            z.object({
              projectId: z.string().uuid(),
              chapterId: z.string().uuid(),
              type: z.string().optional(),
              speakerId: z.string().uuid().optional(),
              emotion: z.string().optional(),
              content: z.string().min(1),
              direction: z.string().optional(),
            }),
          ),
        }),
      )
      .mutation(async ({ input }: { input: { nodeId: string; lines: { projectId: string; chapterId: string; type?: string; speakerId?: string; emotion?: string; content: string; direction?: string }[] } }) => {
        return services.get().dialogueService.bulkCreate(input.nodeId, input.lines);
      }),
  }),

  // ========================================
  // Character Routes
  // ========================================

  character: router({
    /** 프로젝트별 캐릭터 목록 */
    byProject: authProcedure
      .input(z.object({ projectId: z.string().uuid() }))
      .query(async ({ input }: { input: { projectId: string } }) => {
        return services.get().characterService.findByProject(input.projectId);
      }),

    /** 캐릭터 상세 조회 */
    byId: authProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ input }: { input: { id: string } }) => {
      return services.get().characterService.findById(input.id);
    }),

    /** 캐릭터 생성 */
    create: authProcedure.input(createCharacterSchema).mutation(async ({ input }: { input: z.infer<typeof createCharacterSchema> }) => {
      return services.get().characterService.create(input);
    }),

    /** 캐릭터 수정 */
    update: authProcedure
      .input(z.object({ id: z.string().uuid(), data: updateCharacterSchema }))
      .mutation(async ({ input }: { input: { id: string; data: z.infer<typeof updateCharacterSchema> } }) => {
        return services.get().characterService.update(input.id, input.data);
      }),

    /** 캐릭터 삭제 */
    delete: authProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ input }: { input: { id: string } }) => {
      return services.get().characterService.delete(input.id);
    }),
  }),

  // ========================================
  // Beat Routes (Phase 1)
  // ========================================

  beat: router({
    /** 챕터별 비트 목록 */
    byChapter: authProcedure
      .input(z.object({ chapterId: z.string().uuid() }))
      .query(async ({ input }: { input: { chapterId: string } }) => {
        return services.get().beatService.findByChapter(input.chapterId);
      }),

    /** 프로젝트별 비트 목록 */
    byProject: authProcedure
      .input(z.object({ projectId: z.string().uuid() }))
      .query(async ({ input }: { input: { projectId: string } }) => {
        return services.get().beatService.findByProject(input.projectId);
      }),

    /** 비트 상세 조회 */
    byId: authProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ input }: { input: { id: string } }) => {
      return services.get().beatService.findById(input.id);
    }),

    /** 비트 생성 */
    create: authProcedure.input(createBeatSchema).mutation(async ({ input }: { input: z.infer<typeof createBeatSchema> }) => {
      return services.get().beatService.create(input);
    }),

    /** 비트 수정 */
    update: authProcedure
      .input(z.object({ id: z.string().uuid(), data: updateBeatSchema }))
      .mutation(async ({ input }: { input: { id: string; data: z.infer<typeof updateBeatSchema> } }) => {
        return services.get().beatService.update(input.id, input.data);
      }),

    /** 비트 순서 변경 */
    reorder: authProcedure
      .input(
        z.object({
          chapterId: z.string().uuid(),
          ids: z.array(z.string().uuid()),
        }),
      )
      .mutation(async ({ input }: { input: { chapterId: string; ids: string[] } }) => {
        return services.get().beatService.reorder(input.chapterId, input.ids);
      }),

    /** 비트 삭제 */
    delete: authProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ input }: { input: { id: string } }) => {
      return services.get().beatService.delete(input.id);
    }),

    // --- Beat Template Sub-Routes ---

    /** 비트 템플릿 전체 목록 */
    templates: authProcedure.query(async () => {
      return services.get().beatService.findAllTemplates();
    }),

    /** 비트 템플릿 상세 조회 */
    templateById: authProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ input }: { input: { id: string } }) => {
        return services.get().beatService.findTemplateById(input.id);
      }),

    /** 비트 템플릿 생성 */
    createTemplate: authProcedure.input(createBeatTemplateSchema).mutation(async ({ input }: { input: z.infer<typeof createBeatTemplateSchema> }) => {
      return services.get().beatService.createTemplate(input);
    }),

    /** 비트 템플릿 수정 */
    updateTemplate: authProcedure
      .input(z.object({ id: z.string().uuid(), data: updateBeatTemplateSchema }))
      .mutation(async ({ input }: { input: { id: string; data: z.infer<typeof updateBeatTemplateSchema> } }) => {
        return services.get().beatService.updateTemplate(input.id, input.data);
      }),

    /** 비트 템플릿 삭제 */
    deleteTemplate: authProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ input }: { input: { id: string } }) => {
        return services.get().beatService.deleteTemplate(input.id);
      }),
  }),

  // ========================================
  // Ending Routes (Phase 1)
  // ========================================

  ending: router({
    /** 프로젝트별 엔딩 목록 */
    byProject: authProcedure
      .input(z.object({ projectId: z.string().uuid() }))
      .query(async ({ input }: { input: { projectId: string } }) => {
        return services.get().endingService.findByProject(input.projectId);
      }),

    /** 엔딩 상세 조회 */
    byId: authProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ input }: { input: { id: string } }) => {
      return services.get().endingService.findById(input.id);
    }),

    /** 엔딩 생성 — Zod conditionSchema의 children: unknown[] → StoryStudioCondition[] 캐스트 */
    create: authProcedure.input(createEndingSchema).mutation(async ({ input }: { input: z.infer<typeof createEndingSchema> }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return services.get().endingService.create(input as any);
    }),

    /** 엔딩 수정 */
    update: authProcedure
      .input(z.object({ id: z.string().uuid(), data: updateEndingSchema }))
      .mutation(async ({ input }: { input: { id: string; data: z.infer<typeof updateEndingSchema> } }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return services.get().endingService.update(input.id, input.data as any);
      }),

    /** 엔딩 삭제 */
    delete: authProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ input }: { input: { id: string } }) => {
      return services.get().endingService.delete(input.id);
    }),
  }),

  // ========================================
  // Event Routes (Phase 1)
  // ========================================

  event: router({
    /** 프로젝트별 이벤트 목록 */
    byProject: authProcedure
      .input(z.object({ projectId: z.string().uuid() }))
      .query(async ({ input }: { input: { projectId: string } }) => {
        return services.get().eventService.findByProject(input.projectId);
      }),

    /** 이벤트 상세 조회 */
    byId: authProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ input }: { input: { id: string } }) => {
      return services.get().eventService.findById(input.id);
    }),

    /** 이벤트 생성 */
    create: authProcedure.input(createEventSchema).mutation(async ({ input }: { input: z.infer<typeof createEventSchema> }) => {
      return services.get().eventService.create(input);
    }),

    /** 이벤트 수정 */
    update: authProcedure
      .input(z.object({ id: z.string().uuid(), data: updateEventSchema }))
      .mutation(async ({ input }: { input: { id: string; data: z.infer<typeof updateEventSchema> } }) => {
        return services.get().eventService.update(input.id, input.data);
      }),

    /** 이벤트 삭제 */
    delete: authProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ input }: { input: { id: string } }) => {
      return services.get().eventService.delete(input.id);
    }),
  }),
});

export type StoryStudioRouter = typeof storyStudioRouter;

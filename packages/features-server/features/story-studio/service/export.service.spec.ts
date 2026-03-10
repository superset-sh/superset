import { Test, type TestingModule } from "@nestjs/testing";
import { BeatService } from "./beat.service";
import { ChapterService } from "./chapter.service";
import { CharacterService } from "./character.service";
import { DialogueService } from "./dialogue.service";
import { EndingService } from "./ending.service";
import { EventService } from "./event.service";
import { ExportService } from "./export.service";
import { FlagService } from "./flag.service";
import { GraphService } from "./graph.service";
import { ProjectService } from "./project.service";

jest.mock("@/core/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

describe("ExportService", () => {
  let service: ExportService;
  let projectService: jest.Mocked<ProjectService>;
  let chapterService: jest.Mocked<ChapterService>;
  let graphService: jest.Mocked<GraphService>;
  let flagService: jest.Mocked<FlagService>;
  let dialogueService: jest.Mocked<DialogueService>;
  let characterService: jest.Mocked<CharacterService>;
  let beatService: jest.Mocked<BeatService>;
  let endingService: jest.Mocked<EndingService>;
  let eventService: jest.Mocked<EventService>;

  const mockProject = {
    id: "project-1",
    title: "테스트 RPG",
    genre: "어드벤처",
    description: "테스트 프로젝트",
    systemVariables: [{ name: "$player_name", type: "string", defaultValue: "용사" }],
    authorId: "user-1",
    status: "active" as const,
    isDeleted: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockChapter = {
    id: "ch-1",
    projectId: "project-1",
    title: "제1장: 시작",
    code: "CH01",
    order: 1,
    summary: "모험의 시작",
    status: "draft" as const,
    estimatedPlaytime: "30분",
    isDeleted: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockNode = {
    id: "node-1",
    projectId: "project-1",
    chapterId: "ch-1",
    type: "scene" as const,
    code: "SC01",
    label: "마을 입구",
    positionX: 100,
    positionY: 200,
    metadata: null,
    isDeleted: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockEdge = {
    id: "edge-1",
    projectId: "project-1",
    chapterId: "ch-1",
    sourceNodeId: "node-1",
    targetNodeId: "node-2",
    label: "다음",
    order: 1,
    conditions: [],
    effects: [],
    isDeleted: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockDialogue = {
    id: "dlg-1",
    projectId: "project-1",
    chapterId: "ch-1",
    nodeId: "node-1",
    stringId: "DLG_CH01_SC01_001",
    type: "dialogue" as const,
    speakerId: "char-1",
    emotion: "neutral",
    content: "안녕하세요.",
    order: 1,
    direction: null,
    timing: null,
    voiceNote: null,
    tags: ["greeting"],
    isDeleted: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockFlag = {
    id: "flag-1",
    projectId: "project-1",
    name: "trust_npc",
    type: "number" as const,
    defaultValue: "0",
    category: "character" as const,
    description: "NPC 신뢰도",
    isInterpolatable: true,
    isDeleted: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCharacter = {
    id: "char-1",
    projectId: "project-1",
    name: "아린",
    code: "ARIN",
    role: "protagonist" as const,
    personality: "용감하고 정의로운",
    speechStyle: "~요 체",
    isDeleted: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockBeat = {
    id: "beat-1",
    projectId: "project-1",
    chapterId: "ch-1",
    title: "모험의 시작",
    act: "act_1" as const,
    beatType: "catalyst" as const,
    emotionalTone: "hope" as const,
    summary: "주인공이 모험을 떠나기로 결심한다",
    characters: ["char-1"],
    location: "마을 광장",
    purpose: "동기 부여",
    linkedNodes: ["node-1"],
    order: 1,
    isDeleted: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockEnding = {
    id: "ending-1",
    projectId: "project-1",
    title: "진정한 결말",
    type: "true_end" as const,
    description: "모든 퀘스트를 완료한 결말",
    requiredFlags: [{ type: "flag_check", flagId: "flag-1", operator: ">=", value: 10 }],
    graphNodeId: "node-1",
    difficulty: "hard" as const,
    discoveryHint: "모든 NPC와 대화하세요",
    isDeleted: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockEvent = {
    id: "event-1",
    projectId: "project-1",
    name: "first_boss_defeated",
    type: "battle_result" as const,
    description: "첫 번째 보스를 처치한 이벤트",
    effects: [{ flagId: "flag-1", operation: "add", value: 5 }],
    triggeredNodes: ["node-1"],
    isDeleted: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportService,
        {
          provide: ProjectService,
          useValue: { findById: jest.fn() },
        },
        {
          provide: ChapterService,
          useValue: { findByProject: jest.fn() },
        },
        {
          provide: GraphService,
          useValue: { getGraph: jest.fn() },
        },
        {
          provide: FlagService,
          useValue: { findByProject: jest.fn() },
        },
        {
          provide: DialogueService,
          useValue: { findByNode: jest.fn() },
        },
        {
          provide: CharacterService,
          useValue: { findByProject: jest.fn() },
        },
        {
          provide: BeatService,
          useValue: { findByProject: jest.fn() },
        },
        {
          provide: EndingService,
          useValue: { findByProject: jest.fn() },
        },
        {
          provide: EventService,
          useValue: { findByProject: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<ExportService>(ExportService);
    projectService = module.get(ProjectService);
    chapterService = module.get(ChapterService);
    graphService = module.get(GraphService);
    flagService = module.get(FlagService);
    dialogueService = module.get(DialogueService);
    characterService = module.get(CharacterService);
    beatService = module.get(BeatService);
    endingService = module.get(EndingService);
    eventService = module.get(EventService);

    // Phase 1 기본 mock — 빈 배열 (개별 테스트에서 오버라이드 가능)
    beatService.findByProject.mockResolvedValue([]);
    endingService.findByProject.mockResolvedValue([]);
    eventService.findByProject.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // exportProject
  // =========================================================================
  describe("exportProject", () => {
    it("프로젝트 전체를 게임용 JSON으로 조립한다", async () => {
      projectService.findById.mockResolvedValue(mockProject as any);
      chapterService.findByProject.mockResolvedValue([mockChapter] as any);
      flagService.findByProject.mockResolvedValue([mockFlag] as any);
      characterService.findByProject.mockResolvedValue([mockCharacter] as any);
      graphService.getGraph.mockResolvedValue({
        nodes: [mockNode] as any,
        edges: [mockEdge] as any,
      });
      dialogueService.findByNode.mockResolvedValue([mockDialogue] as any);

      const result = await service.exportProject("project-1");

      expect(result.version).toBe("1.0");
      expect(result.exportedAt).toBeDefined();
      expect(result.project.id).toBe("project-1");
      expect(result.project.title).toBe("테스트 RPG");
      expect(result.project.genre).toBe("어드벤처");
      expect(result.project.systemVariables).toHaveLength(1);
      expect(result.chapters).toHaveLength(1);
      expect(result.characters).toHaveLength(1);
      expect(result.flags).toHaveLength(1);
      expect(result.beats).toHaveLength(0);
      expect(result.endings).toHaveLength(0);
      expect(result.events).toHaveLength(0);
    });

    it("챕터 데이터를 올바르게 변환한다", async () => {
      projectService.findById.mockResolvedValue(mockProject as any);
      chapterService.findByProject.mockResolvedValue([mockChapter] as any);
      flagService.findByProject.mockResolvedValue([]);
      characterService.findByProject.mockResolvedValue([]);
      graphService.getGraph.mockResolvedValue({
        nodes: [mockNode] as any,
        edges: [mockEdge] as any,
      });
      dialogueService.findByNode.mockResolvedValue([mockDialogue] as any);

      const result = await service.exportProject("project-1");
      const chapter = result.chapters[0]!;

      expect(chapter.id).toBe("ch-1");
      expect(chapter.code).toBe("CH01");
      expect(chapter.title).toBe("제1장: 시작");
      expect(chapter.order).toBe(1);
      expect(chapter.summary).toBe("모험의 시작");
      expect(chapter.status).toBe("draft");
      expect(chapter.estimatedPlaytime).toBe("30분");
    });

    it("그래프 노드를 position 객체로 변환한다", async () => {
      projectService.findById.mockResolvedValue(mockProject as any);
      chapterService.findByProject.mockResolvedValue([mockChapter] as any);
      flagService.findByProject.mockResolvedValue([]);
      characterService.findByProject.mockResolvedValue([]);
      graphService.getGraph.mockResolvedValue({
        nodes: [mockNode] as any,
        edges: [] as any,
      });
      dialogueService.findByNode.mockResolvedValue([]);

      const result = await service.exportProject("project-1");
      const node = result.chapters[0]!.graph.nodes[0]!;

      expect(node.id).toBe("node-1");
      expect(node.type).toBe("scene");
      expect(node.code).toBe("SC01");
      expect(node.label).toBe("마을 입구");
      expect(node.position).toEqual({ x: 100, y: 200 });
    });

    it("그래프 엣지의 conditions/effects를 변환한다", async () => {
      const edgeWithData = {
        ...mockEdge,
        conditions: [{ type: "flag_check", flagId: "flag-1", operator: ">=", value: 5 }],
        effects: [{ flagId: "flag-1", operation: "add", value: 1 }],
      };

      projectService.findById.mockResolvedValue(mockProject as any);
      chapterService.findByProject.mockResolvedValue([mockChapter] as any);
      flagService.findByProject.mockResolvedValue([]);
      characterService.findByProject.mockResolvedValue([]);
      graphService.getGraph.mockResolvedValue({
        nodes: [mockNode] as any,
        edges: [edgeWithData] as any,
      });
      dialogueService.findByNode.mockResolvedValue([]);

      const result = await service.exportProject("project-1");
      const edge = result.chapters[0]!.graph.edges[0]!;

      expect(edge.conditions).toHaveLength(1);
      expect(edge.conditions[0]).toEqual(
        expect.objectContaining({ type: "flag_check", flagId: "flag-1" }),
      );
      expect(edge.effects).toHaveLength(1);
      expect(edge.effects[0]).toEqual(
        expect.objectContaining({ flagId: "flag-1", operation: "add" }),
      );
    });

    it("대사를 노드별로 조회하고 flat으로 병합한다", async () => {
      const node2 = { ...mockNode, id: "node-2", code: "SC02", label: "숲" };
      const dlg2 = {
        ...mockDialogue,
        id: "dlg-2",
        nodeId: "node-2",
        stringId: "DLG_CH01_SC02_001",
      };

      projectService.findById.mockResolvedValue(mockProject as any);
      chapterService.findByProject.mockResolvedValue([mockChapter] as any);
      flagService.findByProject.mockResolvedValue([]);
      characterService.findByProject.mockResolvedValue([]);
      graphService.getGraph.mockResolvedValue({
        nodes: [mockNode, node2] as any,
        edges: [] as any,
      });
      dialogueService.findByNode
        .mockResolvedValueOnce([mockDialogue] as any)
        .mockResolvedValueOnce([dlg2] as any);

      const result = await service.exportProject("project-1");

      expect(result.chapters[0]!.dialogues).toHaveLength(2);
      expect(dialogueService.findByNode).toHaveBeenCalledTimes(2);
    });

    it("nullable 필드를 undefined로 변환한다", async () => {
      const nullProject = {
        ...mockProject,
        genre: null,
        description: null,
        systemVariables: null,
      };
      const nullChapter = {
        ...mockChapter,
        summary: null,
        estimatedPlaytime: null,
      };
      const nullDialogue = {
        ...mockDialogue,
        speakerId: null,
        emotion: null,
        direction: null,
        timing: null,
        voiceNote: null,
        tags: null,
      };

      projectService.findById.mockResolvedValue(nullProject as any);
      chapterService.findByProject.mockResolvedValue([nullChapter] as any);
      flagService.findByProject.mockResolvedValue([]);
      characterService.findByProject.mockResolvedValue([]);
      graphService.getGraph.mockResolvedValue({
        nodes: [mockNode] as any,
        edges: [] as any,
      });
      dialogueService.findByNode.mockResolvedValue([nullDialogue] as any);

      const result = await service.exportProject("project-1");

      expect(result.project.genre).toBeUndefined();
      expect(result.project.description).toBeUndefined();
      expect(result.project.systemVariables).toEqual([]);

      const ch = result.chapters[0]!;
      expect(ch.summary).toBeUndefined();
      expect(ch.estimatedPlaytime).toBeUndefined();

      const dlg = ch.dialogues[0]!;
      expect(dlg.speakerCharacterId).toBeUndefined();
      expect(dlg.emotion).toBeUndefined();
      expect(dlg.tags).toBeUndefined();
    });

    it("플래그를 올바르게 변환한다", async () => {
      projectService.findById.mockResolvedValue(mockProject as any);
      chapterService.findByProject.mockResolvedValue([]);
      flagService.findByProject.mockResolvedValue([mockFlag] as any);
      characterService.findByProject.mockResolvedValue([]);

      const result = await service.exportProject("project-1");
      const flag = result.flags[0]!;

      expect(flag.id).toBe("flag-1");
      expect(flag.name).toBe("trust_npc");
      expect(flag.type).toBe("number");
      expect(flag.defaultValue).toBe("0");
      expect(flag.category).toBe("character");
      expect(flag.description).toBe("NPC 신뢰도");
      expect(flag.isInterpolatable).toBe(true);
    });

    it("캐릭터를 올바르게 변환한다", async () => {
      projectService.findById.mockResolvedValue(mockProject as any);
      chapterService.findByProject.mockResolvedValue([]);
      flagService.findByProject.mockResolvedValue([]);
      characterService.findByProject.mockResolvedValue([mockCharacter] as any);

      const result = await service.exportProject("project-1");
      const char = result.characters[0]!;

      expect(char.id).toBe("char-1");
      expect(char.name).toBe("아린");
      expect(char.code).toBe("ARIN");
      expect(char.role).toBe("protagonist");
      expect(char.personality).toBe("용감하고 정의로운");
      expect(char.speechStyle).toBe("~요 체");
    });

    it("빈 프로젝트(챕터/플래그/캐릭터 없음)를 정상 처리한다", async () => {
      projectService.findById.mockResolvedValue(mockProject as any);
      chapterService.findByProject.mockResolvedValue([]);
      flagService.findByProject.mockResolvedValue([]);
      characterService.findByProject.mockResolvedValue([]);

      const result = await service.exportProject("project-1");

      expect(result.chapters).toHaveLength(0);
      expect(result.flags).toHaveLength(0);
      expect(result.characters).toHaveLength(0);
      expect(result.beats).toHaveLength(0);
      expect(result.endings).toHaveLength(0);
      expect(result.events).toHaveLength(0);
    });

    it("비트를 올바르게 변환한다", async () => {
      projectService.findById.mockResolvedValue(mockProject as any);
      chapterService.findByProject.mockResolvedValue([]);
      flagService.findByProject.mockResolvedValue([]);
      characterService.findByProject.mockResolvedValue([]);
      beatService.findByProject.mockResolvedValue([mockBeat] as any);

      const result = await service.exportProject("project-1");
      const beat = result.beats[0]!;

      expect(beat.id).toBe("beat-1");
      expect(beat.chapterId).toBe("ch-1");
      expect(beat.title).toBe("모험의 시작");
      expect(beat.act).toBe("act_1");
      expect(beat.beatType).toBe("catalyst");
      expect(beat.emotionalTone).toBe("hope");
      expect(beat.summary).toBe("주인공이 모험을 떠나기로 결심한다");
      expect(beat.characters).toEqual(["char-1"]);
      expect(beat.location).toBe("마을 광장");
      expect(beat.purpose).toBe("동기 부여");
      expect(beat.linkedNodes).toEqual(["node-1"]);
      expect(beat.order).toBe(1);
    });

    it("엔딩을 올바르게 변환한다", async () => {
      projectService.findById.mockResolvedValue(mockProject as any);
      chapterService.findByProject.mockResolvedValue([]);
      flagService.findByProject.mockResolvedValue([]);
      characterService.findByProject.mockResolvedValue([]);
      endingService.findByProject.mockResolvedValue([mockEnding] as any);

      const result = await service.exportProject("project-1");
      const ending = result.endings[0]!;

      expect(ending.id).toBe("ending-1");
      expect(ending.title).toBe("진정한 결말");
      expect(ending.type).toBe("true_end");
      expect(ending.description).toBe("모든 퀘스트를 완료한 결말");
      expect(ending.requiredFlags).toHaveLength(1);
      expect(ending.requiredFlags[0]).toEqual(
        expect.objectContaining({ type: "flag_check", flagId: "flag-1" }),
      );
      expect(ending.graphNodeId).toBe("node-1");
      expect(ending.difficulty).toBe("hard");
      expect(ending.discoveryHint).toBe("모든 NPC와 대화하세요");
    });

    it("이벤트를 올바르게 변환한다", async () => {
      projectService.findById.mockResolvedValue(mockProject as any);
      chapterService.findByProject.mockResolvedValue([]);
      flagService.findByProject.mockResolvedValue([]);
      characterService.findByProject.mockResolvedValue([]);
      eventService.findByProject.mockResolvedValue([mockEvent] as any);

      const result = await service.exportProject("project-1");
      const event = result.events[0]!;

      expect(event.id).toBe("event-1");
      expect(event.name).toBe("first_boss_defeated");
      expect(event.type).toBe("battle_result");
      expect(event.description).toBe("첫 번째 보스를 처치한 이벤트");
      expect(event.effects).toHaveLength(1);
      expect(event.effects[0]).toEqual(
        expect.objectContaining({ flagId: "flag-1", operation: "add", value: 5 }),
      );
      expect(event.triggeredNodes).toEqual(["node-1"]);
    });

    it("Phase 1 엔티티의 nullable 필드를 undefined로 변환한다", async () => {
      const nullBeat = {
        ...mockBeat,
        emotionalTone: null,
        summary: null,
        characters: null,
        location: null,
        purpose: null,
        linkedNodes: null,
      };
      const nullEnding = {
        ...mockEnding,
        description: null,
        requiredFlags: null,
        graphNodeId: null,
        discoveryHint: null,
      };
      const nullEvent = {
        ...mockEvent,
        description: null,
        effects: null,
        triggeredNodes: null,
      };

      projectService.findById.mockResolvedValue(mockProject as any);
      chapterService.findByProject.mockResolvedValue([]);
      flagService.findByProject.mockResolvedValue([]);
      characterService.findByProject.mockResolvedValue([]);
      beatService.findByProject.mockResolvedValue([nullBeat] as any);
      endingService.findByProject.mockResolvedValue([nullEnding] as any);
      eventService.findByProject.mockResolvedValue([nullEvent] as any);

      const result = await service.exportProject("project-1");

      const beat = result.beats[0]!;
      expect(beat.emotionalTone).toBeUndefined();
      expect(beat.summary).toBeUndefined();
      expect(beat.characters).toEqual([]);
      expect(beat.location).toBeUndefined();
      expect(beat.purpose).toBeUndefined();
      expect(beat.linkedNodes).toEqual([]);

      const ending = result.endings[0]!;
      expect(ending.description).toBeUndefined();
      expect(ending.requiredFlags).toEqual([]);
      expect(ending.graphNodeId).toBeUndefined();
      expect(ending.discoveryHint).toBeUndefined();

      const event = result.events[0]!;
      expect(event.description).toBeUndefined();
      expect(event.effects).toEqual([]);
      expect(event.triggeredNodes).toEqual([]);
    });

    it("여러 챕터를 병렬로 처리한다", async () => {
      const ch2 = { ...mockChapter, id: "ch-2", title: "제2장", code: "CH02", order: 2 };

      projectService.findById.mockResolvedValue(mockProject as any);
      chapterService.findByProject.mockResolvedValue([mockChapter, ch2] as any);
      flagService.findByProject.mockResolvedValue([]);
      characterService.findByProject.mockResolvedValue([]);
      graphService.getGraph.mockResolvedValue({
        nodes: [] as any,
        edges: [] as any,
      });

      const result = await service.exportProject("project-1");

      expect(result.chapters).toHaveLength(2);
      expect(graphService.getGraph).toHaveBeenCalledTimes(2);
    });
  });
});

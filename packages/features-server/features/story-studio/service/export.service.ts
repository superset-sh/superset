/**
 * ExportService - 프로젝트 전체 데이터를 게임용 JSON으로 조립
 *
 * Design Doc Section 11 (StoryStudioExport) 스펙에 따라
 * 프로젝트/챕터/그래프/대사/플래그/캐릭터를 하나의 JSON으로 조립합니다.
 */
import { Injectable } from "@nestjs/common";
import { createLogger } from "../../../core/logger";
import type {
  StoryStudioCondition,
  StoryStudioEffect,
} from "@superbuilder/drizzle";
import { ProjectService } from "./project.service";
import { ChapterService } from "./chapter.service";
import { GraphService } from "./graph.service";
import { FlagService } from "./flag.service";
import { DialogueService } from "./dialogue.service";
import { CharacterService } from "./character.service";
import { BeatService } from "./beat.service";
import { EndingService } from "./ending.service";
import { EventService } from "./event.service";

const logger = createLogger("story-studio");

/* ===================================================================== */
/* Export Types                                                           */
/* ===================================================================== */

export interface ExportDialogue {
  stringId: string;
  nodeId: string;
  type: string;
  speakerCharacterId?: string;
  emotion?: string;
  content: string;
  order: number;
  direction?: string;
  timing?: string;
  voiceNote?: string;
  tags?: string[];
}

export interface ExportGraphNode {
  id: string;
  type: string;
  code: string;
  label: string;
  position: { x: number; y: number };
  metadata?: Record<string, unknown>;
}

export interface ExportGraphEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  label?: string;
  order: number;
  conditions: StoryStudioCondition[];
  effects: StoryStudioEffect[];
}

export interface ExportChapter {
  id: string;
  code: string;
  title: string;
  order: number;
  summary?: string;
  status: string;
  estimatedPlaytime?: string;
  graph: {
    nodes: ExportGraphNode[];
    edges: ExportGraphEdge[];
  };
  dialogues: ExportDialogue[];
}

export interface ExportFlag {
  id: string;
  name: string;
  type: string;
  defaultValue?: string;
  category: string;
  description?: string;
  isInterpolatable: boolean;
}

export interface ExportCharacter {
  id: string;
  name: string;
  code: string;
  role: string;
  personality?: string;
  speechStyle?: string;
}

export interface ExportBeat {
  id: string;
  chapterId: string;
  title: string;
  act: string;
  beatType: string;
  emotionalTone?: string;
  summary?: string;
  characters: string[];
  location?: string;
  purpose?: string;
  linkedNodes: string[];
  order: number;
}

export interface ExportEnding {
  id: string;
  title: string;
  type: string;
  description?: string;
  requiredFlags: StoryStudioCondition[];
  graphNodeId?: string;
  difficulty: string;
  discoveryHint?: string;
}

export interface ExportEvent {
  id: string;
  name: string;
  type: string;
  description?: string;
  effects: StoryStudioEffect[];
  triggeredNodes: string[];
}

export interface StoryStudioExport {
  version: "1.0";
  exportedAt: string;
  project: {
    id: string;
    title: string;
    genre?: string;
    description?: string;
    systemVariables: { name: string; type: string; defaultValue: string }[];
  };
  chapters: ExportChapter[];
  characters: ExportCharacter[];
  flags: ExportFlag[];
  beats: ExportBeat[];
  endings: ExportEnding[];
  events: ExportEvent[];
}

/* ===================================================================== */
/* Service                                                                */
/* ===================================================================== */

@Injectable()
export class ExportService {
  constructor(
    private readonly projectService: ProjectService,
    private readonly chapterService: ChapterService,
    private readonly graphService: GraphService,
    private readonly flagService: FlagService,
    private readonly dialogueService: DialogueService,
    private readonly characterService: CharacterService,
    private readonly beatService: BeatService,
    private readonly endingService: EndingService,
    private readonly eventService: EventService,
  ) {}

  async exportProject(projectId: string): Promise<StoryStudioExport> {
    // 1. 프로젝트 메타데이터
    const project = await this.projectService.findById(projectId);

    // 2. 병렬 데이터 조회 — 챕터, 플래그, 캐릭터, 비트, 엔딩, 이벤트
    const [chapters, flags, characters, beats, endings, events] =
      await Promise.all([
        this.chapterService.findByProject(projectId),
        this.flagService.findByProject(projectId),
        this.characterService.findByProject(projectId),
        this.beatService.findByProject(projectId),
        this.endingService.findByProject(projectId),
        this.eventService.findByProject(projectId),
      ]);

    // 3. 챕터별 그래프 + 대사 조회
    const exportChapters: ExportChapter[] = await Promise.all(
      chapters.map(async (chapter) => {
        const graph = await this.graphService.getGraph(chapter.id);

        // 노드별 대사 조회 (병렬)
        const dialoguesByNode = await Promise.all(
          graph.nodes.map(async (node) => {
            const dialogues = await this.dialogueService.findByNode(node.id);
            return dialogues.map((d) => ({
              stringId: d.stringId,
              nodeId: node.id,
              type: d.type,
              speakerCharacterId: d.speakerId ?? undefined,
              emotion: d.emotion ?? undefined,
              content: d.content,
              order: d.order,
              direction: d.direction ?? undefined,
              timing: d.timing ?? undefined,
              voiceNote: d.voiceNote ?? undefined,
              tags: (d.tags as string[] | null) ?? undefined,
            }));
          }),
        );

        return {
          id: chapter.id,
          code: chapter.code,
          title: chapter.title,
          order: chapter.order,
          summary: chapter.summary ?? undefined,
          status: chapter.status,
          estimatedPlaytime: chapter.estimatedPlaytime ?? undefined,
          graph: {
            nodes: graph.nodes.map((n) => ({
              id: n.id,
              type: n.type,
              code: n.code,
              label: n.label,
              position: { x: n.positionX, y: n.positionY },
              metadata: (n.metadata as Record<string, unknown>) ?? undefined,
            })),
            edges: graph.edges.map((e) => ({
              id: e.id,
              sourceNodeId: e.sourceNodeId,
              targetNodeId: e.targetNodeId,
              label: e.label ?? undefined,
              order: e.order,
              conditions: (e.conditions as StoryStudioCondition[]) ?? [],
              effects: (e.effects as StoryStudioEffect[]) ?? [],
            })),
          },
          dialogues: dialoguesByNode.flat(),
        };
      }),
    );

    // 4. 플래그 변환
    const exportFlags: ExportFlag[] = flags.map((f) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      defaultValue: f.defaultValue ?? undefined,
      category: f.category,
      description: f.description ?? undefined,
      isInterpolatable: f.isInterpolatable,
    }));

    // 5. 캐릭터 변환
    const exportCharacters: ExportCharacter[] = characters.map((c) => ({
      id: c.id,
      name: c.name,
      code: c.code,
      role: c.role,
      personality: c.personality ?? undefined,
      speechStyle: c.speechStyle ?? undefined,
    }));

    // 6. 비트 변환
    const exportBeats: ExportBeat[] = beats.map((b) => ({
      id: b.id,
      chapterId: b.chapterId,
      title: b.title,
      act: b.act,
      beatType: b.beatType,
      emotionalTone: b.emotionalTone ?? undefined,
      summary: b.summary ?? undefined,
      characters: (b.characters as string[]) ?? [],
      location: b.location ?? undefined,
      purpose: b.purpose ?? undefined,
      linkedNodes: (b.linkedNodes as string[]) ?? [],
      order: b.order,
    }));

    // 7. 엔딩 변환
    const exportEndings: ExportEnding[] = endings.map((e) => ({
      id: e.id,
      title: e.title,
      type: e.type,
      description: e.description ?? undefined,
      requiredFlags: (e.requiredFlags as StoryStudioCondition[]) ?? [],
      graphNodeId: e.graphNodeId ?? undefined,
      difficulty: e.difficulty,
      discoveryHint: e.discoveryHint ?? undefined,
    }));

    // 8. 이벤트 변환
    const exportEvents: ExportEvent[] = events.map((ev) => ({
      id: ev.id,
      name: ev.name,
      type: ev.type,
      description: ev.description ?? undefined,
      effects: (ev.effects as StoryStudioEffect[]) ?? [],
      triggeredNodes: (ev.triggeredNodes as string[]) ?? [],
    }));

    const result: StoryStudioExport = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      project: {
        id: project.id,
        title: project.title,
        genre: project.genre ?? undefined,
        description: project.description ?? undefined,
        systemVariables: (project.systemVariables ?? []) as {
          name: string;
          type: string;
          defaultValue: string;
        }[],
      },
      chapters: exportChapters,
      characters: exportCharacters,
      flags: exportFlags,
      beats: exportBeats,
      endings: exportEndings,
      events: exportEvents,
    };

    logger.info("Project exported", {
      "story_studio.project_id": projectId,
      "story_studio.chapters_count": exportChapters.length,
      "story_studio.characters_count": exportCharacters.length,
      "story_studio.flags_count": exportFlags.length,
      "story_studio.beats_count": exportBeats.length,
      "story_studio.endings_count": exportEndings.length,
      "story_studio.events_count": exportEvents.length,
    });

    return result;
  }
}

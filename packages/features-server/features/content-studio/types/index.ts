import type {
  StudioStudio,
  StudioTopic,
  StudioContent,
  StudioContentSeo,
  StudioEdge,
} from "@superbuilder/drizzle";

/** 스튜디오 + 소유자 정보 */
export type StudioWithOwner = StudioStudio & {
  ownerName: string | null;
  ownerAvatar: string | null;
  topicCount: number;
  contentCount: number;
};

/** 콘텐츠 + 작성자 정보 */
export type ContentWithAuthor = StudioContent & {
  authorName: string | null;
  authorAvatar: string | null;
  topicLabel: string | null;
};

/** 캔버스 전체 데이터 (스튜디오 + 모든 노드/엣지) */
export type CanvasData = {
  studio: StudioStudio;
  topics: StudioTopic[];
  contents: ContentWithAuthor[];
  edges: StudioEdge[];
};

/** SEO 이력 */
export type SeoHistoryEntry = StudioContentSeo;

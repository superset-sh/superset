/**
 * AI Feature - 공용 타입
 */

export interface TopicSuggestion {
  title: string;
  description: string;
  nodeType: string;
  relevance: string;
}

export interface DraftContent {
  title: string;
  summary: string;
  content: {
    type: "doc";
    content: Array<Record<string, unknown>>;
  };
}

export interface SuggestTopicsInput {
  contextTitle: string;
  contextDescription?: string;
  items: { title: string; itemType: string; contentPreview: string }[];
  nodeTypes?: string[];
  brandContext?: string; // 브랜드 보이스 컨텍스트
}

export interface GenerateDraftInput {
  contextTitle: string;
  topicTitle: string;
  topicDescription: string;
  nodeType: string;
  existingTitles: string[];
  brandContext?: string; // 브랜드 보이스 컨텍스트
}

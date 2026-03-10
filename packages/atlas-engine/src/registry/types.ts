/** Feature 타입 */
export type FeatureType = "page" | "widget" | "agent";

/** Feature 그룹 */
export type FeatureGroup = "core" | "content" | "commerce" | "community" | "system" | "template";

/** Router 매핑 정보 */
export interface RouterMapping {
  /** tRPC router 객체 키 (예: "blog", "helloWorld") */
  key: string;
  /** import 변수명 (예: "blogRouter", "communityMainRouter") */
  import: string;
  /** import 경로 (예: "@repo/features/blog") */
  from: string;
}

/** Server 코드 경로 */
export interface ServerPaths {
  module: string;
  router: string;
  controller: string;
}

/** Client 코드 경로 */
export interface ClientPaths {
  app?: string;
  admin?: string;
}

/** Widget 경로 (type === "widget"인 경우) */
export interface WidgetPaths {
  path: string;
  export: string;
}

/** Agent Server 경로 (type === "agent"인 경우) */
export interface AgentServerPaths {
  routes?: string;
  services?: string;
  tools?: string;
}

/** Schema 정보 */
export interface SchemaPaths {
  tables: string[];
  path: string;
}

/** Admin 설정 */
export interface AdminConfig {
  showInSidebar: boolean;
  path?: string;
  label?: string;
  order?: number;
}

/** 환경변수 분류 */
export interface EnvConfig {
  infrastructure: string[];
  feature: string[];
}

/** Feature Registry 항목 */
export interface FeatureEntry {
  name: string;
  type: FeatureType;
  icon: string;
  group: FeatureGroup;
  description?: string;

  dependencies: string[];
  optionalDependencies: string[];

  router: RouterMapping;
  server: ServerPaths;
  client: ClientPaths;
  schema: SchemaPaths;

  widget?: WidgetPaths;
  agentServer?: AgentServerPaths;
  admin?: AdminConfig;
  env?: EnvConfig;
}

/** Feature 그룹 메타데이터 */
export interface GroupMeta {
  label: string;
  order: number;
}

/** 전체 Registry */
export interface FeatureRegistry {
  version: string;
  source: string;
  features: Record<string, FeatureEntry>;
  core: string[];
  groups: Record<string, GroupMeta>;
}

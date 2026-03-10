export type {
  FeatureRegistry,
  FeatureEntry,
  FeatureType,
  FeatureGroup,
  RouterMapping,
  ServerPaths,
  ClientPaths,
  WidgetPaths,
  AgentServerPaths,
  SchemaPaths,
  AdminConfig,
  EnvConfig,
  GroupMeta,
} from "./types";

export { scanFeatureDirectory, buildRegistryFromScan } from "./scanner";
export { loadRegistry, validateRegistry } from "./loader";

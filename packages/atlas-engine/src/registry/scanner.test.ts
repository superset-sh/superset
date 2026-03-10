import { describe, expect, test } from "bun:test";
import { scanFeatureDirectory, buildRegistryFromScan } from "./scanner";

describe("scanFeatureDirectory", () => {
  test("should detect feature directories from packages/features/", () => {
    // 환경변수 또는 기본값으로 Feature Atlas 경로 지정
    // CI에서는 ATLAS_PATH 환경변수 설정 필요
    const atlasPath = process.env.ATLAS_PATH ?? "/Users/bright/Projects/feature-atlas";
    const features = scanFeatureDirectory(atlasPath);

    expect(features.length).toBeGreaterThan(30);
    expect(features).toContain("blog");
    expect(features).toContain("payment");
    expect(features).toContain("community");
    // _common, __test-utils__ 제외
    expect(features).not.toContain("_common");
    expect(features).not.toContain("__test-utils__");
  });
});

describe("buildRegistryFromScan", () => {
  test("should build registry with correct paths for blog feature", () => {
    const atlasPath = process.env.ATLAS_PATH ?? "/Users/bright/Projects/feature-atlas";
    const registry = buildRegistryFromScan(atlasPath);

    const blog = registry.features["blog"];
    expect(blog).toBeDefined();
    expect(blog.name).toBe("blog");
    expect(blog.server.module).toContain("packages/features/blog/");
    expect(blog.schema.path).toContain("packages/drizzle/src/schema/features/blog/");
  });

  test("should detect widget features", () => {
    const atlasPath = process.env.ATLAS_PATH ?? "/Users/bright/Projects/feature-atlas";
    const registry = buildRegistryFromScan(atlasPath);

    const comment = registry.features["comment"];
    expect(comment).toBeDefined();
    expect(comment.type).toBe("widget");
    expect(comment.widget).toBeDefined();
    expect(comment.widget?.path).toContain("packages/widgets/src/comment/");
  });

  test("should detect agent features", () => {
    const atlasPath = process.env.ATLAS_PATH ?? "/Users/bright/Projects/feature-atlas";
    const registry = buildRegistryFromScan(atlasPath);

    const agentDesk = registry.features["agent-desk"];
    expect(agentDesk).toBeDefined();
    expect(agentDesk.type).toBe("agent");
  });

  test("should include core features", () => {
    const atlasPath = process.env.ATLAS_PATH ?? "/Users/bright/Projects/feature-atlas";
    const registry = buildRegistryFromScan(atlasPath);

    expect(registry.core).toContain("profile");
  });
});

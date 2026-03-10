import { describe, expect, test } from "bun:test";
import { resolveFeatures } from "./resolver";
import type { FeatureRegistry } from "../registry/types";

/** 테스트용 최소 registry */
function createTestRegistry(): FeatureRegistry {
  return {
    version: "1.0.0",
    source: "test",
    core: ["profile"],
    groups: {},
    features: {
      profile: {
        name: "profile", type: "page", icon: "User", group: "core",
        dependencies: [], optionalDependencies: [],
        router: { key: "profile", import: "profileRouter", from: "@repo/features/profile" },
        server: { module: "", router: "", controller: "" },
        client: {}, schema: { tables: [], path: "" },
      },
      blog: {
        name: "blog", type: "page", icon: "FileText", group: "content",
        dependencies: ["profile"], optionalDependencies: ["comment", "reaction"],
        router: { key: "blog", import: "blogRouter", from: "@repo/features/blog" },
        server: { module: "", router: "", controller: "" },
        client: {}, schema: { tables: [], path: "" },
      },
      comment: {
        name: "comment", type: "widget", icon: "MessageSquare", group: "community",
        dependencies: ["profile"], optionalDependencies: ["reaction"],
        router: { key: "comment", import: "commentRouter", from: "@repo/features/comment" },
        server: { module: "", router: "", controller: "" },
        client: {}, schema: { tables: [], path: "" },
        widget: { path: "packages/widgets/src/comment/", export: "@repo/widgets/comment" },
      },
      reaction: {
        name: "reaction", type: "widget", icon: "Heart", group: "community",
        dependencies: ["profile"], optionalDependencies: [],
        router: { key: "reaction", import: "reactionRouter", from: "@repo/features/reaction" },
        server: { module: "", router: "", controller: "" },
        client: {}, schema: { tables: [], path: "" },
        widget: { path: "packages/widgets/src/reaction/", export: "@repo/widgets/reaction" },
      },
      payment: {
        name: "payment", type: "page", icon: "CreditCard", group: "commerce",
        dependencies: ["profile"], optionalDependencies: ["notification"],
        router: { key: "payment", import: "paymentRouter", from: "@repo/features/payment" },
        server: { module: "", router: "", controller: "" },
        client: {}, schema: { tables: [], path: "" },
      },
      notification: {
        name: "notification", type: "widget", icon: "Bell", group: "system",
        dependencies: ["profile"], optionalDependencies: ["email"],
        router: { key: "notification", import: "notificationRouter", from: "@repo/features/notification" },
        server: { module: "", router: "", controller: "" },
        client: {}, schema: { tables: [], path: "" },
      },
      email: {
        name: "email", type: "page", icon: "Mail", group: "system",
        dependencies: [], optionalDependencies: [],
        router: { key: "email", import: "emailRouter", from: "@repo/features/email" },
        server: { module: "", router: "", controller: "" },
        client: {}, schema: { tables: [], path: "" },
      },
    },
  };
}

describe("resolveFeatures", () => {
  const registry = createTestRegistry();

  test("should auto-include core features", () => {
    const result = resolveFeatures(registry, ["blog"]);

    expect(result.resolved).toContain("profile");
    expect(result.autoIncluded).toContain("profile");
  });

  test("should auto-include direct dependencies", () => {
    const result = resolveFeatures(registry, ["blog"]);

    expect(result.selected).toEqual(["blog"]);
    expect(result.resolved).toContain("profile");
    expect(result.resolved).toContain("blog");
  });

  test("should list available optional dependencies", () => {
    const result = resolveFeatures(registry, ["blog"]);

    expect(result.availableOptional).toContain("comment");
    expect(result.availableOptional).toContain("reaction");
  });

  test("should resolve transitive dependencies", () => {
    // blog -> comment (optional, 명시 선택) -> profile (auto)
    const result = resolveFeatures(registry, ["blog", "comment"]);

    expect(result.resolved).toContain("profile");
    expect(result.resolved).toContain("blog");
    expect(result.resolved).toContain("comment");
  });

  test("should return topologically sorted order", () => {
    const result = resolveFeatures(registry, ["blog", "comment", "reaction"]);

    const profileIdx = result.resolved.indexOf("profile");
    const blogIdx = result.resolved.indexOf("blog");
    const commentIdx = result.resolved.indexOf("comment");

    // profile은 blog, comment보다 먼저
    expect(profileIdx).toBeLessThan(blogIdx);
    expect(profileIdx).toBeLessThan(commentIdx);
  });

  test("should deduplicate features", () => {
    // blog과 comment 둘 다 profile에 의존
    const result = resolveFeatures(registry, ["blog", "comment"]);

    const profileCount = result.resolved.filter((f) => f === "profile").length;
    expect(profileCount).toBe(1);
  });

  test("should handle empty selection (core only)", () => {
    const result = resolveFeatures(registry, []);

    expect(result.selected).toEqual([]);
    expect(result.resolved).toEqual(["profile"]);
  });

  test("should detect missing dependency", () => {
    const badRegistry = structuredClone(registry);
    badRegistry.features["blog"].dependencies = ["nonexistent"];

    expect(() => resolveFeatures(badRegistry, ["blog"])).toThrow("missing_dependency");
  });

  test("should detect circular dependency", () => {
    const badRegistry = structuredClone(registry);
    badRegistry.features["profile"].dependencies = ["blog"];
    // blog -> profile -> blog (순환)

    expect(() => resolveFeatures(badRegistry, ["blog"])).toThrow("circular_dependency");
  });
});

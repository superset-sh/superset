import {
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { InjectDrizzle } from "@superbuilder/drizzle";
import type { DrizzleDB } from "@superbuilder/drizzle";
import { catalogFeatures, catalogDependencies } from "@superbuilder/drizzle";
import { eq, and, asc } from "drizzle-orm";
import { createLogger } from "../../../../core/logger";
import type { CreateCatalogFeatureDto } from "../dto/create-catalog-feature.dto";
import type { UpdateCatalogFeatureDto } from "../dto/update-catalog-feature.dto";

const logger = createLogger("feature-catalog");

@Injectable()
export class FeatureCatalogService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  /* ──────────────────────────── Public ──────────────────────────── */

  async findPublished(input?: {
    group?: string;
    search?: string;
    tags?: string[];
  }) {
    const rows = await this.db.query.catalogFeatures.findMany({
      where: eq(catalogFeatures.isPublished, true),
      orderBy: [asc(catalogFeatures.order), asc(catalogFeatures.name)],
      with: {
        dependencies: {
          with: { dependsOn: true },
        },
      },
    });

    let result = rows;

    if (input?.group) {
      result = result.filter((r) => r.group === input.group);
    }
    if (input?.search) {
      const q = input.search.toLowerCase();
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q) ||
          r.slug.toLowerCase().includes(q),
      );
    }
    if (input?.tags && input.tags.length > 0) {
      result = result.filter((r) =>
        input.tags!.some((t) => (r.tags ?? []).includes(t)),
      );
    }

    return result;
  }

  async findBySlug(slug: string) {
    const feature = await this.db.query.catalogFeatures.findFirst({
      where: and(
        eq(catalogFeatures.slug, slug),
        eq(catalogFeatures.isPublished, true),
      ),
      with: {
        dependencies: {
          with: { dependsOn: true },
        },
        dependedBy: {
          with: { feature: true },
        },
      },
    });

    if (!feature) {
      throw new NotFoundException(`Feature not found: ${slug}`);
    }

    return feature;
  }

  async getDependencyGraph(slugs: string[]) {
    const allFeatures = await this.db.query.catalogFeatures.findMany({
      where: eq(catalogFeatures.isPublished, true),
      with: {
        dependencies: {
          with: { dependsOn: true },
        },
      },
    });

    const featureMap = new Map(allFeatures.map((f) => [f.slug, f]));
    const resolved = new Set<string>();
    const queue = [...slugs];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (resolved.has(current)) continue;
      resolved.add(current);

      const feature = featureMap.get(current);
      if (!feature) continue;

      for (const dep of feature.dependencies) {
        if (dep.dependsOn && !resolved.has(dep.dependsOn.slug)) {
          queue.push(dep.dependsOn.slug);
        }
      }
    }

    return {
      resolvedSlugs: [...resolved],
      features: [...resolved]
        .map((s) => featureMap.get(s))
        .filter(Boolean),
    };
  }

  async validateSelection(slugs: string[]) {
    const allFeatures = await this.db.query.catalogFeatures.findMany({
      where: eq(catalogFeatures.isPublished, true),
      with: {
        dependencies: true,
      },
    });

    const featureMap = new Map(allFeatures.map((f) => [f.id, f]));
    const slugToId = new Map(allFeatures.map((f) => [f.slug, f.id]));
    const idToSlug = new Map(allFeatures.map((f) => [f.id, f.slug]));

    const selectedIds = new Set(
      slugs.map((s) => slugToId.get(s)).filter(Boolean) as string[],
    );

    const missing: Array<{
      feature: string;
      missingDependency: string;
      type: string;
    }> = [];

    for (const slug of slugs) {
      const featureId = slugToId.get(slug);
      if (!featureId) continue;

      const feature = featureMap.get(featureId);
      if (!feature) continue;

      for (const dep of feature.dependencies) {
        if (
          dep.dependencyType === "required" &&
          !selectedIds.has(dep.dependsOnId)
        ) {
          missing.push({
            feature: slug,
            missingDependency: idToSlug.get(dep.dependsOnId) ?? dep.dependsOnId,
            type: dep.dependencyType,
          });
        }
      }
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /* ──────────────────────────── Admin ──────────────────────────── */

  async adminFindAll() {
    return this.db.query.catalogFeatures.findMany({
      orderBy: [asc(catalogFeatures.order), asc(catalogFeatures.name)],
      with: {
        dependencies: {
          with: { dependsOn: true },
        },
      },
    });
  }

  async findById(id: string) {
    const feature = await this.db.query.catalogFeatures.findFirst({
      where: eq(catalogFeatures.id, id),
      with: {
        dependencies: {
          with: { dependsOn: true },
        },
        dependedBy: {
          with: { feature: true },
        },
      },
    });

    if (!feature) {
      throw new NotFoundException(`Feature not found: ${id}`);
    }

    return feature;
  }

  async create(input: CreateCatalogFeatureDto) {
    const existing = await this.db.query.catalogFeatures.findFirst({
      where: eq(catalogFeatures.slug, input.slug),
    });

    if (existing) {
      throw new ConflictException(`Slug already exists: ${input.slug}`);
    }

    const [created] = await this.db
      .insert(catalogFeatures)
      .values({
        slug: input.slug,
        name: input.name,
        description: input.description,
        icon: input.icon,
        group: input.group,
        tags: input.tags,
        previewImages: input.previewImages,
        capabilities: input.capabilities,
        techStack: input.techStack,
        isCore: input.isCore,
        isPublished: input.isPublished,
        order: input.order,
      })
      .returning();

    if (!created) {
      throw new Error("Failed to create catalog feature");
    }

    logger.info("Catalog feature created", {
      "feature_catalog.feature_id": created.id,
      "feature_catalog.slug": created.slug,
    });

    return this.findById(created.id);
  }

  async update(id: string, input: UpdateCatalogFeatureDto) {
    const existing = await this.findById(id);

    if (input.slug && input.slug !== existing.slug) {
      const duplicate = await this.db.query.catalogFeatures.findFirst({
        where: eq(catalogFeatures.slug, input.slug),
      });
      if (duplicate) {
        throw new ConflictException(`Slug already exists: ${input.slug}`);
      }
    }

    await this.db
      .update(catalogFeatures)
      .set(input)
      .where(eq(catalogFeatures.id, id));

    logger.info("Catalog feature updated", {
      "feature_catalog.feature_id": id,
      "feature_catalog.slug": existing.slug,
    });

    return this.findById(id);
  }

  async reorder(items: Array<{ id: string; order: number }>) {
    await this.db.transaction(async (tx) => {
      for (const item of items) {
        await tx
          .update(catalogFeatures)
          .set({ order: item.order })
          .where(eq(catalogFeatures.id, item.id));
      }
    });

    logger.info("Catalog features reordered", {
      "feature_catalog.count": items.length,
    });

    return { success: true };
  }

  async addDependency(
    featureId: string,
    dependsOnId: string,
    dependencyType: "required" | "recommended" | "optional" = "required",
  ) {
    await this.findById(featureId);
    await this.findById(dependsOnId);

    if (featureId === dependsOnId) {
      throw new ConflictException("A feature cannot depend on itself");
    }

    const existing = await this.db.query.catalogDependencies.findFirst({
      where: and(
        eq(catalogDependencies.featureId, featureId),
        eq(catalogDependencies.dependsOnId, dependsOnId),
      ),
    });

    if (existing) {
      throw new ConflictException("Dependency already exists");
    }

    const [dep] = await this.db
      .insert(catalogDependencies)
      .values({ featureId, dependsOnId, dependencyType })
      .returning();

    logger.info("Catalog dependency added", {
      "feature_catalog.feature_id": featureId,
      "feature_catalog.depends_on_id": dependsOnId,
      "feature_catalog.dependency_type": dependencyType,
    });

    return dep;
  }

  async removeDependency(dependencyId: string) {
    const existing = await this.db.query.catalogDependencies.findFirst({
      where: eq(catalogDependencies.id, dependencyId),
    });

    if (!existing) {
      throw new NotFoundException(`Dependency not found: ${dependencyId}`);
    }

    await this.db
      .delete(catalogDependencies)
      .where(eq(catalogDependencies.id, dependencyId));

    logger.info("Catalog dependency removed", {
      "feature_catalog.dependency_id": dependencyId,
      "feature_catalog.feature_id": existing.featureId,
      "feature_catalog.depends_on_id": existing.dependsOnId,
    });

    return { success: true };
  }
}

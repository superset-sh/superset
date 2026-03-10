import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from "@nestjs/swagger";
import { JwtAuthGuard, NestAdminGuard } from "../../../../core/nestjs/auth";
import { FeatureCatalogService } from "../service/feature-catalog.service";
import { CreateCatalogFeatureDto } from "../dto/create-catalog-feature.dto";
import { UpdateCatalogFeatureDto } from "../dto/update-catalog-feature.dto";

@ApiTags("Feature Catalog")
@Controller("feature-catalog")
export class FeatureCatalogController {
  constructor(
    private readonly featureCatalogService: FeatureCatalogService,
  ) {}

  /* ──────────────────────────── Public ──────────────────────────── */

  @Get()
  @ApiOperation({ summary: "List published catalog features" })
  @ApiQuery({ name: "group", required: false, type: String })
  @ApiQuery({ name: "search", required: false, type: String })
  @ApiQuery({ name: "tags", required: false, type: String, description: "Comma-separated tags" })
  @ApiResponse({ status: 200, description: "Published features list" })
  async findPublished(
    @Query("group") group?: string,
    @Query("search") search?: string,
    @Query("tags") tags?: string,
  ) {
    return this.featureCatalogService.findPublished({
      group,
      search,
      tags: tags ? tags.split(",") : undefined,
    });
  }

  @Get("by-slug/:slug")
  @ApiOperation({ summary: "Get feature by slug" })
  @ApiParam({ name: "slug", description: "Feature slug" })
  @ApiResponse({ status: 200, description: "Feature detail" })
  @ApiResponse({ status: 404, description: "Feature not found" })
  async findBySlug(@Param("slug") slug: string) {
    return this.featureCatalogService.findBySlug(slug);
  }

  @Post("dependency-graph")
  @ApiOperation({ summary: "Resolve dependency graph for given slugs" })
  @ApiResponse({ status: 200, description: "Resolved dependency graph" })
  async getDependencyGraph(@Body() body: { slugs: string[] }) {
    return this.featureCatalogService.getDependencyGraph(body.slugs);
  }

  @Post("validate-selection")
  @ApiOperation({ summary: "Validate feature selection for missing dependencies" })
  @ApiResponse({ status: 200, description: "Validation result" })
  async validateSelection(@Body() body: { slugs: string[] }) {
    return this.featureCatalogService.validateSelection(body.slugs);
  }

  /* ──────────────────────────── Admin ──────────────────────────── */

  @Get("admin/all")
  @UseGuards(JwtAuthGuard, NestAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "List all catalog features (admin)" })
  @ApiResponse({ status: 200, description: "All features including unpublished" })
  async adminFindAll() {
    return this.featureCatalogService.adminFindAll();
  }

  @Get("admin/:id")
  @UseGuards(JwtAuthGuard, NestAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get feature by ID (admin)" })
  @ApiParam({ name: "id", description: "Feature UUID" })
  @ApiResponse({ status: 200, description: "Feature detail" })
  @ApiResponse({ status: 404, description: "Feature not found" })
  async findById(@Param("id", ParseUUIDPipe) id: string) {
    return this.featureCatalogService.findById(id);
  }

  @Post("admin")
  @UseGuards(JwtAuthGuard, NestAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create catalog feature" })
  @ApiResponse({ status: 201, description: "Feature created" })
  @ApiResponse({ status: 409, description: "Slug already exists" })
  async create(@Body() dto: CreateCatalogFeatureDto) {
    return this.featureCatalogService.create(dto);
  }

  @Put("admin/:id")
  @UseGuards(JwtAuthGuard, NestAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update catalog feature" })
  @ApiParam({ name: "id", description: "Feature UUID" })
  @ApiResponse({ status: 200, description: "Feature updated" })
  @ApiResponse({ status: 404, description: "Feature not found" })
  @ApiResponse({ status: 409, description: "Slug already exists" })
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateCatalogFeatureDto,
  ) {
    return this.featureCatalogService.update(id, dto);
  }

  @Put("admin/reorder")
  @UseGuards(JwtAuthGuard, NestAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Bulk reorder catalog features" })
  @ApiResponse({ status: 200, description: "Features reordered" })
  async reorder(@Body() body: Array<{ id: string; order: number }>) {
    return this.featureCatalogService.reorder(body);
  }

  @Post("admin/dependency")
  @UseGuards(JwtAuthGuard, NestAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Add dependency between features" })
  @ApiResponse({ status: 201, description: "Dependency added" })
  @ApiResponse({ status: 409, description: "Dependency already exists" })
  async addDependency(
    @Body()
    body: {
      featureId: string;
      dependsOnId: string;
      dependencyType?: "required" | "recommended" | "optional";
    },
  ) {
    return this.featureCatalogService.addDependency(
      body.featureId,
      body.dependsOnId,
      body.dependencyType,
    );
  }

  @Delete("admin/dependency/:id")
  @UseGuards(JwtAuthGuard, NestAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Remove dependency" })
  @ApiParam({ name: "id", description: "Dependency UUID" })
  @ApiResponse({ status: 200, description: "Dependency removed" })
  @ApiResponse({ status: 404, description: "Dependency not found" })
  async removeDependency(@Param("id", ParseUUIDPipe) id: string) {
    return this.featureCatalogService.removeDependency(id);
  }
}

import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, ParseUUIDPipe, DefaultValuePipe, ParseIntPipe } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard, CurrentUser, User } from "../../../../core/nestjs/auth";
import { BlogService } from "../service/blog.service";
import { CreateBlogPostDto, UpdateBlogPostDto, ClapPostDto, CreateResponseDto } from "../../dto/index";

@ApiTags("Blog")
@Controller("blog")
export class BlogController {
    constructor(private readonly blogService: BlogService) { }

    @Get("posts")
    @ApiOperation({ summary: "Get blog posts" })
    async getPosts(
        @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit?: number,
        @Query("cursor") cursor?: string,
        @Query("authorId") authorId?: string,
    ) {
        return this.blogService.getPosts({ limit, cursor, authorId });
    }

    @Get("posts/:slug")
    @ApiOperation({ summary: "Get a post by slug" })
    async getPostBySlug(
        @Param("slug") slug: string,
        @CurrentUser() user?: User
    ) {
        return this.blogService.getPostBySlug(slug, user?.id);
    }

    @Post("posts")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: "Create a new blog post" })
    async createPost(
        @CurrentUser() user: User,
        @Body() dto: CreateBlogPostDto
    ) {
        return this.blogService.createPost(user.id, dto);
    }

    @Put("posts/:id")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: "Update an existing blog post" })
    async updatePost(
        @CurrentUser() user: User,
        @Param("id", ParseUUIDPipe) id: string,
        @Body() dto: UpdateBlogPostDto
    ) {
        return this.blogService.updatePost(user.id, id, dto);
    }

    @Delete("posts/:id")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: "Delete a blog post" })
    async deletePost(
        @CurrentUser() user: User,
        @Param("id", ParseUUIDPipe) id: string
    ) {
        return this.blogService.deletePost(user.id, id);
    }

    @Post("clap")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: "Clap for a post (1-50)" })
    async clapPost(
        @CurrentUser() user: User,
        @Body() dto: ClapPostDto
    ) {
        return this.blogService.clapPost(user.id, dto);
    }

    @Post("responses")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: "Add a response/comment to a post" })
    async createResponse(
        @CurrentUser() user: User,
        @Body() dto: CreateResponseDto
    ) {
        return this.blogService.createResponse(user.id, dto);
    }

    @Get("posts/:id/responses")
    @ApiOperation({ summary: "Get responses for a post" })
    async getResponses(@Param("id", ParseUUIDPipe) id: string) {
        return this.blogService.getResponses(id);
    }

    @Post("posts/:id/bookmark")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: "Toggle bookmark for a post" })
    async toggleBookmark(
        @CurrentUser() user: User,
        @Param("id", ParseUUIDPipe) id: string
    ) {
        return this.blogService.toggleBookmark(user.id, id);
    }
}

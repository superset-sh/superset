import { Injectable, Logger, NotFoundException, ConflictException, ForbiddenException } from "@nestjs/common";
import { InjectDrizzle, type DrizzleDB, blogPosts, blogClaps, blogResponses, blogBookmarks } from "@superbuilder/drizzle";
import { eq, and, sql, desc } from "drizzle-orm";
import { CreateBlogPostDto, UpdateBlogPostDto, ClapPostDto, CreateResponseDto } from "../../dto";

@Injectable()
export class BlogService {
    private readonly logger = new Logger(BlogService.name);

    constructor(@InjectDrizzle() private readonly db: DrizzleDB) { }

    async getPosts(
        params: {
            cursor?: string;
            limit?: number;
            authorId?: string;
            status?: "draft" | "published" | "archived";
        } = {}
    ) {
        const { limit = 20, status = "published", authorId } = params;

        let query = this.db.select().from(blogPosts).where(eq(blogPosts.status, status));

        if (authorId) {
            query = this.db
                .select()
                .from(blogPosts)
                .where(and(eq(blogPosts.status, status), eq(blogPosts.authorId, authorId)));
        }

        const posts = await query.orderBy(desc(blogPosts.createdAt)).limit(limit + 1);

        let nextCursor: string | undefined = undefined;
        if (posts.length > limit) {
            const nextItem = posts.pop();
            nextCursor = nextItem!.id; // Simple cursor based on ID for infinite scroll
        }

        return {
            items: posts,
            nextCursor,
        };
    }

    async getPostBySlug(slug: string, viewerId?: string) {
        const [post] = await this.db.select().from(blogPosts).where(eq(blogPosts.slug, slug)).limit(1);

        if (!post) {
            throw new NotFoundException(`Post not found: ${slug}`);
        }

        // Increment view count if viewed by someone else
        if (!viewerId || viewerId !== post.authorId) {
            await this.db
                .update(blogPosts)
                .set({ viewCount: sql`${blogPosts.viewCount} + 1` })
                .where(eq(blogPosts.id, post.id));
        }

        let userClaps = 0;
        let isBookmarked = false;

        if (viewerId) {
            const [clapRecord] = await this.db
                .select()
                .from(blogClaps)
                .where(and(eq(blogClaps.postId, post.id), eq(blogClaps.userId, viewerId)))
                .limit(1);

            if (clapRecord) {
                userClaps = clapRecord.count;
            }

            const [bookmarkRecord] = await this.db
                .select()
                .from(blogBookmarks)
                .where(and(eq(blogBookmarks.postId, post.id), eq(blogBookmarks.userId, viewerId)))
                .limit(1);

            if (bookmarkRecord) {
                isBookmarked = true;
            }
        }

        return {
            ...post,
            userClaps,
            isBookmarked,
        };
    }

    async getPostById(id: string) {
        const [post] = await this.db.select().from(blogPosts).where(eq(blogPosts.id, id)).limit(1);
        if (!post) {
            throw new NotFoundException(`Post not found: ${id}`);
        }
        return post;
    }

    async createPost(userId: string, data: CreateBlogPostDto) {
        const slug = this.generateSlug(data.title);

        // 슬러그 중복 체크
        const existing = await this.db.select().from(blogPosts).where(eq(blogPosts.slug, slug)).limit(1);

        if (existing.length > 0) {
            throw new ConflictException(`Slug already exists: ${slug}`);
        }

        const [post] = await this.db
            .insert(blogPosts)
            .values({
                authorId: userId,
                title: data.title,
                slug,
                content: data.content,
                excerpt: data.excerpt,
                coverImage: data.coverImage,
                status: data.status,
                publishedAt: data.status === "published" ? new Date() : null,
            })
            .returning();

        this.logger.log(`Created new blog post: ${post!.id}`);
        return post;
    }

    async updatePost(userId: string, postId: string, data: UpdateBlogPostDto) {
        const post = await this.getPostById(postId);
        if (post.authorId !== userId) throw new ForbiddenException("수정 권한이 없습니다.");

        const updateData: Record<string, unknown> = { ...data };
        if (data.status === "published" && post.status !== "published") {
            updateData.publishedAt = new Date();
        }

        if (data.title && data.title !== post.title) {
            updateData.slug = this.generateSlug(data.title);
        }

        const [updatedPost] = await this.db
            .update(blogPosts)
            .set(updateData as any)
            .where(eq(blogPosts.id, postId))
            .returning();

        this.logger.log(`Updated blog post: ${updatedPost!.id}`);
        return updatedPost;
    }

    async deletePost(userId: string, postId: string) {
        const post = await this.getPostById(postId);
        if (post.authorId !== userId) throw new ForbiddenException("삭제 권한이 없습니다.");

        await this.db.delete(blogPosts).where(eq(blogPosts.id, postId));
        this.logger.log(`Deleted blog post: ${postId}`);
        return { success: true };
    }

    async clapPost(userId: string, data: ClapPostDto) {
        const { postId, count } = data;
        await this.getPostById(postId);

        const [existingClap] = await this.db
            .select()
            .from(blogClaps)
            .where(and(eq(blogClaps.postId, postId), eq(blogClaps.userId, userId)))
            .limit(1);

        if (existingClap) {
            if (existingClap.count >= 50) {
                throw new ConflictException("이미 50번 박수쳤습니다.");
            }

            const newTotal = Math.min(50, existingClap.count + count);
            const diff = newTotal - existingClap.count;

            await this.db
                .update(blogClaps)
                .set({ count: newTotal })
                .where(eq(blogClaps.id, existingClap.id));

            await this.db
                .update(blogPosts)
                .set({ clapsCount: sql`${blogPosts.clapsCount} + ${diff}` })
                .where(eq(blogPosts.id, postId));

            return { totalCount: newTotal };
        } else {
            const initialCount = Math.min(50, count);

            await this.db.insert(blogClaps).values({
                postId,
                userId,
                count: initialCount,
            });

            await this.db
                .update(blogPosts)
                .set({ clapsCount: sql`${blogPosts.clapsCount} + ${initialCount}` })
                .where(eq(blogPosts.id, postId));

            return { totalCount: initialCount };
        }
    }

    async createResponse(userId: string, data: CreateResponseDto) {
        await this.getPostById(data.postId);
        const [response] = await this.db
            .insert(blogResponses)
            .values({
                postId: data.postId,
                authorId: userId,
                parentId: data.parentId,
                content: data.content,
            })
            .returning();

        await this.db
            .update(blogPosts)
            .set({ responsesCount: sql`${blogPosts.responsesCount} + 1` })
            .where(eq(blogPosts.id, data.postId));

        return response;
    }

    async getResponses(postId: string) {
        await this.getPostById(postId);
        const responses = await this.db
            .select()
            .from(blogResponses)
            .where(and(eq(blogResponses.postId, postId), eq(blogResponses.isDeleted, false)))
            .orderBy(desc(blogResponses.createdAt));

        return responses;
    }

    async toggleBookmark(userId: string, postId: string) {
        await this.getPostById(postId);
        const [existing] = await this.db
            .select()
            .from(blogBookmarks)
            .where(and(eq(blogBookmarks.postId, postId), eq(blogBookmarks.userId, userId)))
            .limit(1);

        if (existing) {
            await this.db.delete(blogBookmarks).where(eq(blogBookmarks.id, existing.id));
            return { bookmarked: false };
        } else {
            await this.db.insert(blogBookmarks).values({ postId, userId });
            return { bookmarked: true };
        }
    }

    // Helper
    private generateSlug(title: string): string {
        const baseSlug = title
            .toLowerCase()
            .trim()
            .replace(/[^\w\s-]/g, "")
            .replace(/[\s_-]+/g, "-")
            .replace(/^-+|-+$/g, "");

        const shortId = Math.random().toString(36).substring(2, 8);
        return `${baseSlug}-${shortId}`;
    }
}

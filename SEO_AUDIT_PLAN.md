# Superset SEO Audit & Improvement Plan

**Audit Date:** January 26, 2026
**Sites Audited:** superset.sh (marketing + blog), docs.superset.sh

---

## Executive Summary

The Superset websites have a solid foundation with Next.js 16 and proper content structure, but are missing several critical SEO elements that significantly impact search visibility. The most urgent issues are:

1. **No robots.txt** on either site - search engines have no crawl guidance
2. **No sitemap.xml** on either site - pages aren't efficiently discovered
3. **Docs OG/Twitter images resolve to localhost** - broken social previews and share cards
4. **LLM/MDX endpoints are indexable** - duplicate content + wasted crawl budget
5. **Missing canonical URLs** - risk of duplicate content issues
6. **No structured data (JSON-LD)** - missing rich snippets in search results
7. **Incomplete Open Graph/Twitter Cards** - poor social sharing experience (blog index + non-home pages)

---

## Critical Issues (Fix Immediately)

### 1. Missing robots.txt (Both Sites)

**Impact:** Search engines have no guidance on crawl behavior, crawl budget may be wasted.

**Files to create:**

#### Marketing Site
```
apps/marketing/src/app/robots.ts
```
```typescript
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/_next/"],
      },
    ],
    sitemap: "https://superset.sh/sitemap.xml",
  };
}
```

#### Docs Site
```
apps/docs/src/app/robots.ts
```
```typescript
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/_next/", "/llms.mdx/", "/*.mdx"],
      },
    ],
    sitemap: "https://docs.superset.sh/sitemap.xml",
  };
}
```

---

### 2. Missing sitemap.xml (Both Sites)

**Impact:** Search engines discover new pages slowly, blog posts may not be indexed promptly.

#### Marketing Site
```
apps/marketing/src/app/sitemap.ts
```
```typescript
import type { MetadataRoute } from "next";
import { getBlogPosts } from "@/lib/blog";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://superset.sh";

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date("2025-01-15"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: new Date("2025-01-15"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/ports`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  // Dynamic blog posts
  const posts = await getBlogPosts();
  const blogPages: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  return [...staticPages, ...blogPages];
}
```

#### Docs Site
```
apps/docs/src/app/sitemap.ts
```
```typescript
import type { MetadataRoute } from "next";
import { source } from "@/lib/source";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://docs.superset.sh";

  const pages = source.getPages();

  return pages.map((page) => ({
    url: `${baseUrl}${page.url}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: page.url === "/quick-start" ? 1.0 : 0.8,
  }));
}
```

---

### 3. Missing Canonical URLs

**Impact:** Potential duplicate content issues, PageRank dilution.

#### Marketing Site - Update layout.tsx
```
apps/marketing/src/app/layout.tsx
```
Add `metadataBase`:
```typescript
export const metadata: Metadata = {
  metadataBase: new URL("https://superset.sh"),
  // ... existing metadata
  alternates: {
    canonical: "/",
  },
};
```

#### Docs Site - Update layout.tsx
```
apps/docs/src/app/layout.tsx
```
Add `metadataBase`:
```typescript
export const metadata: Metadata = {
  metadataBase: new URL("https://docs.superset.sh"),
  // ... existing metadata
};
```

---

### 4. Docs OG/Twitter Images Resolve to localhost

**Impact:** Broken social previews and incorrect OG image URLs in production (currently resolving to `http://localhost:3000/...`).

**Root cause:** `metadataBase` is not set for docs, and OG image URLs are generated as relative paths.

**Fix:** Set `metadataBase` and ensure OG/Twitter images use relative URLs that resolve against it.

```
apps/docs/src/app/layout.tsx
```
```typescript
export const metadata: Metadata = {
  metadataBase: new URL("https://docs.superset.sh"),
  // ... existing metadata
};
```

```
apps/docs/src/app/(docs)/[[...slug]]/page.tsx
```
```typescript
export async function generateMetadata(
  props: PageProps<"/[[...slug]]">,
): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const pageImage = getPageImage(page).url;

  return {
    title: page.data.title,
    description: page.data.description,
    openGraph: {
      images: [pageImage],
    },
    twitter: {
      card: "summary_large_image",
      images: [pageImage],
    },
  };
}
```

---

### 5. LLM/MDX Endpoints Are Indexable (Duplicate Content)

**Impact:** Duplicate content (`/quick-start.mdx`, `/llms.mdx/...`) can be indexed alongside the canonical docs URLs.

**Fix:** Add `X-Robots-Tag: noindex, nofollow` and disallow these paths in `robots.txt`.

```
apps/docs/src/app/llms.mdx/[[...slug]]/route.ts
```
```typescript
return new Response(await getLLMText(page), {
  headers: {
    "Content-Type": "text/markdown",
    "X-Robots-Tag": "noindex, nofollow",
  },
});
```

```
apps/docs/src/app/robots.ts
```
```typescript
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/_next/", "/llms.mdx/", "/*.mdx"],
      },
    ],
    sitemap: "https://docs.superset.sh/sitemap.xml",
  };
}
```

---

### 6. Missing Structured Data (JSON-LD)

**Impact:** No rich snippets in search results, missing knowledge graph signals.

#### Homepage - Organization Schema
```
apps/marketing/src/app/components/JsonLd/JsonLd.tsx
```
```typescript
export function OrganizationJsonLd() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Superset",
    url: "https://superset.sh",
    logo: "https://superset.sh/logo.png",
    description: "Run 10+ parallel coding agents on your machine",
    sameAs: [
      "https://github.com/AviSupersetSH/superset",
      "https://twitter.com/AviSupersetSH",
      "https://discord.gg/superset",
    ],
    foundingDate: "2024",
    founders: [
      {
        "@type": "Person",
        name: "Avi Peltz",
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function SoftwareApplicationJsonLd() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Superset",
    operatingSystem: "macOS, Windows, Linux",
    applicationCategory: "DeveloperApplication",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    description: "Run 10+ parallel coding agents on your machine",
    url: "https://superset.sh",
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
```

#### Blog Posts - Article Schema
```
apps/marketing/src/app/blog/[slug]/components/ArticleJsonLd/ArticleJsonLd.tsx
```
```typescript
interface ArticleJsonLdProps {
  title: string;
  description: string;
  author: string;
  publishedTime: string;
  url: string;
  image?: string;
}

export function ArticleJsonLd({
  title,
  description,
  author,
  publishedTime,
  url,
  image,
}: ArticleJsonLdProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    author: {
      "@type": "Person",
      name: author,
    },
    publisher: {
      "@type": "Organization",
      name: "Superset",
      logo: {
        "@type": "ImageObject",
        url: "https://superset.sh/logo.png",
      },
    },
    datePublished: publishedTime,
    dateModified: publishedTime,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
    },
    ...(image && {
      image: {
        "@type": "ImageObject",
        url: image,
      },
    }),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
```

#### Docs Site - TechArticle Schema
```
apps/docs/src/app/(docs)/[[...slug]]/components/DocsJsonLd/DocsJsonLd.tsx
```
```typescript
interface DocsJsonLdProps {
  title: string;
  description: string;
  url: string;
}

export function DocsJsonLd({ title, description, url }: DocsJsonLdProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: title,
    description,
    author: {
      "@type": "Organization",
      name: "Superset",
    },
    publisher: {
      "@type": "Organization",
      name: "Superset",
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
```

---

## High Priority Issues

### 7. Incomplete Open Graph & Twitter Cards

**Impact:** Poor social sharing appearance, lower click-through rates from social.
**Current gap:** Blog index (`/blog`) and non-home marketing pages (`/ports`, `/privacy`, `/terms`) only set title/description, so OG/Twitter metadata is missing or inherited from the homepage.

#### Marketing Homepage - Add OG metadata
```
apps/marketing/src/app/layout.tsx
```
Update metadata export:
```typescript
export const metadata: Metadata = {
  metadataBase: new URL("https://superset.sh"),
  title: {
    default: "Superset - Run 10+ parallel coding agents on your machine",
    template: "%s | Superset",
  },
  description:
    "Run 10+ parallel coding agents on your machine. Spin up new coding tasks while waiting for your current agent to finish.",
  keywords: [
    "coding agents",
    "parallel execution",
    "developer tools",
    "AI coding",
    "git worktrees",
    "code automation",
  ],
  authors: [{ name: "Superset Team" }],
  creator: "Superset",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://superset.sh",
    siteName: "Superset",
    title: "Superset - Run 10+ parallel coding agents on your machine",
    description:
      "Run 10+ parallel coding agents on your machine. Spin up new coding tasks while waiting for your current agent to finish.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Superset - The Terminal for Coding Agents",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Superset - Run 10+ parallel coding agents on your machine",
    description:
      "Run 10+ parallel coding agents on your machine. Spin up new coding tasks while waiting for your current agent to finish.",
    images: ["/opengraph-image"],
    creator: "@AviSupersetSH",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/favicon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};
```

#### Blog Index - Add OG/Twitter + Canonical
```
apps/marketing/src/app/blog/page.tsx
```
```typescript
export const metadata: Metadata = {
  title: "Blog | Superset",
  description:
    "News, updates, and insights from the Superset team about parallel coding agents and developer productivity.",
  alternates: {
    canonical: "/blog",
  },
  openGraph: {
    title: "Blog | Superset",
    description:
      "News, updates, and insights from the Superset team about parallel coding agents and developer productivity.",
    url: "https://superset.sh/blog",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Blog | Superset",
    description:
      "News, updates, and insights from the Superset team about parallel coding agents and developer productivity.",
    images: ["/opengraph-image"],
  },
};
```

### 8. Create OG Image

**Action:** Implement dynamic OG image generation and use `/opengraph-image` as the global fallback.

```
apps/marketing/src/app/opengraph-image.tsx
```
```typescript
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Superset - The Terminal for Coding Agents";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Inter, sans-serif",
        }}
      >
        <div style={{ fontSize: 72, fontWeight: 700, color: "#fff" }}>
          Superset
        </div>
        <div
          style={{
            fontSize: 32,
            color: "#a0a0a0",
            marginTop: 24,
            textAlign: "center",
            maxWidth: 800,
          }}
        >
          Run 10+ parallel coding agents on your machine
        </div>
      </div>
    ),
    { ...size }
  );
}
```

---

## Medium Priority Issues

### 9. Blog Post Metadata Improvements

**Current:** Blog posts have basic OG metadata, but no default share image when frontmatter lacks `image`.
**Improvement:** Add canonical URLs and ensure every post has an OG image (frontmatter or generated fallback).

```
apps/marketing/src/app/blog/[slug]/page.tsx
```
Update `generateMetadata`:
```typescript
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPost(slug);

  if (!post) {
    return { title: "Post Not Found" };
  }

  const url = `https://superset.sh/blog/${slug}`;

  const imageUrl = post.image || "/opengraph-image";

  return {
    title: post.title,
    description: post.description || `Read ${post.title} on the Superset blog`,
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      url,
      siteName: "Superset",
      publishedTime: new Date(post.date).toISOString(),
      authors: [post.author],
      images: [{ url: imageUrl, width: 1200, height: 630, alt: post.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
      images: [imageUrl],
    },
  };
}
```

### 10. Docs Site Metadata Improvements

```
apps/docs/src/app/layout.tsx
```
```typescript
export const metadata: Metadata = {
  metadataBase: new URL("https://docs.superset.sh"),
  title: {
    default: "Superset Documentation",
    template: "%s | Superset Docs",
  },
  description: "Official documentation for Superset - the terminal for coding agents",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://docs.superset.sh",
    siteName: "Superset Docs",
  },
  twitter: {
    card: "summary_large_image",
    creator: "@AviSupersetSH",
  },
};
```

```
apps/docs/src/app/(docs)/[[...slug]]/page.tsx
```
```typescript
return {
  title: page.data.title,
  description: page.data.description,
  alternates: {
    canonical: page.url,
  },
  openGraph: {
    images: [getPageImage(page).url],
  },
  twitter: {
    card: "summary_large_image",
    images: [getPageImage(page).url],
  },
};
```

### 11. Add Apple Touch Icon

**Action:** Create and add apple-touch-icon.png (180x180) to public directories.

```
apps/marketing/public/apple-touch-icon.png
apps/docs/public/apple-touch-icon.png
```

### 12. Add Web Manifest

```
apps/marketing/public/manifest.json
```
```json
{
  "name": "Superset",
  "short_name": "Superset",
  "description": "Run 10+ parallel coding agents on your machine",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#0a0a0a",
  "icons": [
    {
      "src": "/favicon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    }
  ]
}
```

---

## Low Priority Improvements

### 13. Internal Linking Strategy

**Blog improvements:**
- Add "Related Posts" section at the end of each blog post
- Add contextual links within blog content to other posts
- Link from homepage features to relevant blog posts

### 14. Image Optimization

**Actions:**
- Add `loading="lazy"` to below-fold images
- Ensure all images have descriptive alt text
- Use Next.js Image component with proper width/height
- Create responsive image variants

### 15. Performance Optimizations (Core Web Vitals)

**Actions:**
- Preconnect to external domains (fonts.googleapis.com, etc.)
- Lazy load heavy components (Three.js on homepage)
- Consider server-rendering homepage instead of client-only
- Add resource hints

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="dns-prefetch" href="https://ph.superset.sh" />
```

### 16. RSS Feed for Blog

```
apps/marketing/src/app/blog/feed.xml/route.ts
```
```typescript
import { getBlogPosts } from "@/lib/blog";

export async function GET() {
  const posts = await getBlogPosts();
  const baseUrl = "https://superset.sh";

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Superset Blog</title>
    <link>${baseUrl}/blog</link>
    <description>News, updates, and insights from the Superset team</description>
    <language>en-us</language>
    <atom:link href="${baseUrl}/blog/feed.xml" rel="self" type="application/rss+xml"/>
    ${posts
      .map(
        (post) => `
    <item>
      <title>${post.title}</title>
      <link>${baseUrl}/blog/${post.slug}</link>
      <description>${post.description || ""}</description>
      <pubDate>${new Date(post.date).toUTCString()}</pubDate>
      <guid>${baseUrl}/blog/${post.slug}</guid>
    </item>`
      )
      .join("")}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      "Content-Type": "application/xml",
    },
  });
}
```

---

## Implementation Priority

### Phase 1: Critical (Week 1)
1. [ ] Create robots.txt for marketing site
2. [ ] Create robots.txt for docs site (disallow MDX/LLM endpoints)
3. [ ] Create sitemap.xml for marketing site
4. [ ] Create sitemap.xml for docs site
5. [ ] Add metadataBase to both sites
6. [ ] Fix docs OG/Twitter image URLs (metadataBase + page metadata)
7. [ ] Add X-Robots-Tag noindex for LLM/MDX endpoints
8. [ ] Update root layout metadata with full OG/Twitter cards
9. [ ] Add OG/Twitter + canonical for blog index and key marketing pages

### Phase 2: High Priority (Week 2)
10. [ ] Create Organization JSON-LD for homepage
11. [ ] Create Article JSON-LD for blog posts
12. [ ] Create OG image generation
13. [ ] Add canonical URLs to all pages

### Phase 3: Medium Priority (Week 3)
14. [ ] Add TechArticle JSON-LD to docs
15. [ ] Create apple-touch-icon
16. [ ] Add web manifest
17. [ ] Update blog post metadata (default OG image)

### Phase 4: Enhancements (Week 4+)
18. [ ] Implement RSS feed
19. [ ] Add related posts to blog
20. [ ] Performance optimizations
21. [ ] Internal linking improvements

---

## Verification Checklist

After implementation, verify with:

- [ ] [Google Search Console](https://search.google.com/search-console) - Submit sitemaps
- [ ] [Google Rich Results Test](https://search.google.com/test/rich-results) - Validate JSON-LD
- [ ] [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) - Check OG tags
- [ ] [Twitter Card Validator](https://cards-dev.twitter.com/validator) - Check Twitter cards
- [ ] Manual check: docs OG/Twitter image URLs resolve to `https://docs.superset.sh/og/docs/...` (no localhost)
- [ ] [Lighthouse](https://web.dev/measure/) - Check SEO score
- [ ] [Ahrefs Webmaster Tools](https://ahrefs.com/webmaster-tools) - Free site audit

---

## Monitoring

Set up ongoing monitoring:

1. **Google Search Console** - Track indexing, impressions, clicks
2. **Core Web Vitals** - Monitor LCP, FID, CLS via Vercel Analytics
3. **Keyword rankings** - Track target keywords weekly
4. **Crawl errors** - Monitor via Search Console weekly

---

## Target Keywords

### Primary Keywords
- "parallel coding agents"
- "coding agents terminal"
- "AI coding assistant"
- "git worktrees"

### Secondary Keywords
- "run multiple AI agents"
- "developer productivity tools"
- "code automation"
- "Claude Code alternative"
- "Codex alternative"

### Long-tail Keywords
- "how to run parallel coding agents"
- "best terminal for AI coding"
- "git worktrees for AI development"

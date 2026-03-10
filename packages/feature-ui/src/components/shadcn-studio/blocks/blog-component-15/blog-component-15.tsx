import { SearchIcon, ArrowRightIcon, CalendarDaysIcon } from 'lucide-react'

import { Badge } from '@superbuilder/feature-ui/shadcn/badge'
import { Button } from '@superbuilder/feature-ui/shadcn/button'
import { Card, CardContent } from '@superbuilder/feature-ui/shadcn/card'
import { Input } from '@superbuilder/feature-ui/shadcn/input'
import { ScrollArea, ScrollBar } from '@superbuilder/feature-ui/shadcn/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@superbuilder/feature-ui/shadcn/tabs'

export type BlogPost = {
  title: string
  description: string
  imageUrl: string
  imageAlt: string
  date: string
  category: string
  author: string
  authorLink: string
  blogLink: string
  categoryLink: string
}

type BlogProps = {
  blogPosts: BlogPost[]
}

const BlogGrid = ({ posts }: { posts: BlogPost[] }) => {
  return (
    <div className='grid gap-6 sm:grid-cols-2 lg:grid-cols-3'>
      {posts.map((post, index) => (
        <Card key={index} className='group h-full overflow-hidden shadow-none transition-all duration-300'>
          <CardContent className='space-y-3.5'>
            <div className='mb-6 overflow-hidden rounded-lg sm:mb-12'>
              <a href={post.blogLink}>
                <img
                  src={post.imageUrl}
                  alt={post.imageAlt}
                  className='h-59.5 w-full object-cover transition-transform duration-300 group-hover:scale-105'
                />
              </a>
            </div>
            <div className='flex items-center justify-between gap-1.5'>
              <div className='text-muted-foreground flex items-center gap-1.5'>
                <CalendarDaysIcon className='size-6' />
                <span>{post.date}</span>
              </div>
              <a href={post.categoryLink}>
                <Badge className='bg-primary/10 text-primary rounded-full border-0 text-sm'>{post.category}</Badge>
              </a>
            </div>
            <h3 className='line-clamp-2 text-lg font-medium md:text-xl'>
              <a href={post.blogLink}>{post.title}</a>
            </h3>
            <p className='text-muted-foreground line-clamp-2'>{post.description}</p>
            <div className='flex items-center justify-between'>
              <a href={post.authorLink} className='text-sm font-medium'>
                {post.author}
              </a>
              <Button size='icon' variant='outline' className='group-hover:bg-primary! group-hover:text-primary-foreground group-hover:border-primary hover:border-primary hover:bg-primary! hover:text-primary-foreground' render={<a href={post.blogLink} />} nativeButton={false}><ArrowRightIcon className='size-4 -rotate-45' /><span className='sr-only'>Read more: {post.title}</span></Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

const Blog = ({ blogPosts }: BlogProps) => {
  const categories = ['All', 'Product', 'Design', 'Startup Growth']

  return (
    <section className='py-8 sm:py-16 lg:py-24'>
      <div className='mx-auto max-w-7xl space-y-8 px-4 sm:px-6 lg:space-y-16 lg:px-8'>
        {/* Header */}
        <div className='space-y-4'>
          <p className='text-sm'>Blogs</p>

          <h2 className='text-2xl font-semibold md:text-3xl lg:text-4xl'>
            Build Better Products with Insights & Inspiration.
          </h2>

          <p className='text-muted-foreground text-lg md:text-xl'>
            Practical insights and real stories to guide your product from vision to reality.
          </p>
        </div>

        {/* Tabs and Search */}
        <Tabs defaultValue='All' className='gap-8 lg:gap-16'>
          <div className='flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center'>
            <ScrollArea className='bg-muted w-full rounded-lg sm:w-auto'>
              <TabsList className='h-auto gap-1'>
                {categories.map(category => (
                  <TabsTrigger
                    key={category}
                    value={category}
                    className='hover:bg-primary/10 cursor-pointer rounded-lg px-4 text-base'
                  >
                    {category}
                  </TabsTrigger>
                ))}
              </TabsList>
              <ScrollBar orientation='horizontal' />
            </ScrollArea>

            <div className='relative max-md:w-full'>
              <div className='text-muted-foreground pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center pl-3 peer-disabled:opacity-50'>
                <SearchIcon className='size-4' />
                <span className='sr-only'>Search</span>
              </div>
              <Input
                type='search'
                placeholder='Search'
                className='peer h-10 px-9 [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none [&::-webkit-search-results-button]:appearance-none [&::-webkit-search-results-decoration]:appearance-none'
              />
            </div>
          </div>

          {/* All Posts Tab */}
          <TabsContent value='All'>
            <BlogGrid posts={blogPosts} />
          </TabsContent>

          {/* Category-specific Tabs */}
          {categories.slice(1).map((category, index) => (
            <TabsContent key={index} value={category}>
              <BlogGrid posts={blogPosts.filter(post => post.category === category)} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  )
}

export default Blog

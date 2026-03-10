import { ArrowRightIcon, CalendarDaysIcon } from 'lucide-react'

import { Badge } from '@superbuilder/feature-ui/shadcn/badge'
import { Button } from '@superbuilder/feature-ui/shadcn/button'
import { Card, CardContent } from '@superbuilder/feature-ui/shadcn/card'

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

const Blog = ({ blogPosts }: { blogPosts: BlogPost[] }) => {
  return (
    <section className='py-8 sm:py-16 lg:py-24'>
      <div className='mx-auto max-w-7xl space-y-16 px-4 py-8 sm:px-6 lg:px-8'>
        {/* Header */}
        <div className='space-y-4'>
          <Badge variant='outline'>Trending</Badge>

          <h2 className='text-2xl font-semibold md:text-3xl lg:text-4xl'>Related Post</h2>

          <p className='text-muted-foreground text-lg md:text-xl'>
            Expand your knowledge with these hand-picked posts.
          </p>
        </div>

        {/* Tabs and Search */}
        <div className='grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3'>
          {blogPosts.map(post => (
            <Card key={post.title} className='group h-full overflow-hidden shadow-none'>
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
                    <Badge className='bg-primary/10 text-primary border-0 text-sm'>{post.category}</Badge>
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
                  <Button size='icon' variant='outline' className='group-hover:bg-primary! group-hover:text-primary-foreground group-hover:border-primary hover:border-primary hover:bg-primary! hover:text-primary-foreground transition-colors duration-300' render={<a href={post.authorLink} />} nativeButton={false}><ArrowRightIcon className='size-4 -rotate-45' /><span className='sr-only'>Read more: {post.title}</span></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Blog

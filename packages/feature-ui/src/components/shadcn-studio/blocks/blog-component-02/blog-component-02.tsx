import { Avatar, AvatarFallback, AvatarImage } from '@superbuilder/feature-ui/shadcn/avatar'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@superbuilder/feature-ui/shadcn/card'
import { Badge } from '@superbuilder/feature-ui/shadcn/badge'
import { Button } from '@superbuilder/feature-ui/shadcn/button'
import { Separator } from '@superbuilder/feature-ui/shadcn/separator'

type BlogPost = {
  author: string
  date: string
  title: string
  tags: string[]
  image: string
  alt: string
  blogLink: string
}[]

const Blog = ({ blogPosts }: { blogPosts: BlogPost }) => {
  return (
    <section className='bg-muted py-8 sm:py-16 lg:py-24'>
      <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
        {/* Header */}
        <div className='mb-12 text-center sm:mb-16 lg:mb-24'>
          <h2 className='mb-4 text-2xl font-semibold md:text-3xl lg:text-4xl'>Our Blog</h2>
          <p className='text-muted-foreground text-xl'>
            Discover insights about SaaS innovations,
            <br />
            best practices, and strategies to empower your business.
          </p>
        </div>

        <div className='grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-center'>
          {/* Featured Blog Post */}
          <Card className='shadow-none'>
            <CardContent>
              <img
                src='https://cdn.shadcnstudio.com/ss-assets/blocks/marketing/blog/image-7.png'
                alt='Robot'
                className='max-h-76 w-full rounded-lg object-cover'
              />
            </CardContent>
            <CardHeader className='gap-3'>
              <div className='flex items-center gap-2 py-1'>
                <a href='#' className='text-base font-semibold'>
                  Emerson Dias
                </a>
                <span className='text-muted-foreground'>19 Nov, 2020</span>
              </div>
              <CardTitle className='text-3xl font-medium'>
                <a href='#'>Exploring the Exciting Future of AI in Everyday Life</a>
              </CardTitle>
              <CardDescription className='line-clamp-3 text-base'>
                Artificial Intelligence is rapidly evolving, promising to reshape how we interact with technology daily.
                This article delves into upcoming AI innovations and their potential impact on our daily routines...
                <a href='#' className='text-card-foreground inline text-sm font-medium'>
                  Read more
                </a>
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <a href='#' className='flex items-center gap-2'>
                <Avatar>
                  <AvatarImage
                    src='https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-5.png'
                    alt='Craig Herwitz'
                    className='size-8 rounded-full'
                  />
                  <AvatarFallback className='rounded-full text-xs'>CH</AvatarFallback>
                </Avatar>
                <div className='flex flex-col'>
                  <span className='font-medium'>Craig Herwitz</span>
                  <span className='text-muted-foreground text-xs'>Customer Success Manager</span>
                </div>
              </a>
            </CardFooter>
          </Card>

          {/* Right Side Blog Posts */}
          <div className='space-y-10'>
            {blogPosts.map((item, index) => (
              <div key={index} className='space-y-10'>
                <a href={item.blogLink} className='flex items-center justify-between gap-6 max-sm:flex-wrap'>
                  <div>
                    <div className='mb-1.5 flex items-center gap-2 py-1'>
                      <span className='font-medium'>{item.author}</span>
                      <span className='text-muted-foreground'>{item.date}</span>
                    </div>
                    <h3 className='mb-5 text-xl font-medium'>{item.title}</h3>
                    <div className='flex flex-wrap gap-2'>
                      {item.tags.map((tag, index) => (
                        <Badge key={index} variant='outline'>
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <img src={item.image} alt={item.alt} className='h-38 w-42 shrink-0 rounded-lg object-cover' />
                </a>

                {index < blogPosts.length - 1 && <Separator />}
              </div>
            ))}
          </div>
        </div>

        <div className='mt-12 text-center sm:mt-16 lg:mt-24'>
          <Button size='lg' className='rounded-lg text-base' render={<a href='#' />} nativeButton={false}>See All Blogs</Button>
        </div>
      </div>
    </section>
  )
}

export default Blog

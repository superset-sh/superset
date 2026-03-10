import { Avatar, AvatarFallback, AvatarImage } from '@superbuilder/feature-ui/shadcn/avatar'
import { Badge } from '@superbuilder/feature-ui/shadcn/badge'
import { Card } from '@superbuilder/feature-ui/shadcn/card'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious
} from '@superbuilder/feature-ui/shadcn/carousel'

type BlogSlide = {
  image: string
  alt: string
  author: string
  authorImg: string
  role: string
  date: string
  readTime: string
  title: string
  tags: string[]
  blogLink: string
}[]

const Blog = ({ blogSlides }: { blogSlides: BlogSlide }) => {
  return (
    <section className='py-8 sm:py-16 lg:py-24'>
      <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
        <Carousel
          opts={{
            align: 'start'
          }}
          className='w-full'
        >
          <div className='mb-12 flex justify-between gap-8 max-md:flex-col sm:mb-16 md:items-end md:gap-16 lg:mb-24'>
            {/* Header */}
            <div className='space-y-4'>
              <Badge variant='outline' className='text-sm font-normal'>
                World-class Project
              </Badge>
              <h2 className='text-2xl font-semibold md:text-3xl lg:text-4xl'>
                Get updates and insights from our expert team!
              </h2>
              <p className='text-muted-foreground text-xl'>
                Discover tips, best practices, and the latest trends in Laravel development. Unlock your potential with
                expert guidance and technical insights to enhance your projects. Stay ahead of the curve by exploring
                innovative solutions and community-driven resources.
              </p>
            </div>

            <div className='flex items-center gap-4'>
              <CarouselPrevious
                variant='default'
                size='lg'
                className='disabled:bg-primary/10 disabled:text-primary static size-10 translate-y-0 rounded-full disabled:opacity-100'
              />
              <CarouselNext
                variant='default'
                className='disabled:bg-primary/10 disabled:text-primary static size-10 translate-y-0 rounded-full disabled:opacity-100'
              />
            </div>
          </div>

          <CarouselContent className='-ml-2 md:-ml-4'>
            {blogSlides.map((slide, index) => (
              <CarouselItem key={index} className='pl-6 md:basis-1/2 lg:basis-1/3'>
                <a href={slide.blogLink}>
                  <Card className='bg-muted group relative overflow-hidden border-0 p-0 shadow-none'>
                    <div className='opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus:opacity-100 max-sm:aspect-3/4'>
                      <img src={slide.image} alt={slide.alt} className='h-full w-full object-cover' />
                    </div>
                    <div className='absolute inset-0 bg-black/40 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus:opacity-100' />
                    <div className='absolute flex h-full flex-col justify-between p-6'>
                      <div className='flex items-center gap-2'>
                        <Avatar className='size-12'>
                          <AvatarImage src={slide.authorImg} alt={slide.author} />
                          <AvatarFallback className='text-xs'>DA</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className='mb-1 text-lg font-semibold transition-all duration-300 group-hover:text-white group-focus:text-white'>
                            {slide.author}
                          </p>
                          <p className='text-muted-foreground transition-all duration-300 group-hover:text-white group-focus:text-white'>
                            {slide.role}
                          </p>
                        </div>
                      </div>
                      <div className='space-y-4'>
                        <div className='text-muted-foreground flex items-center gap-2 py-1 transition-all duration-300 group-hover:text-white group-focus:text-white'>
                          <p>{slide.date}</p>
                          <span className='bg-primary size-2 rounded-full' />
                          <p>{slide.readTime}</p>
                        </div>
                        <h3 className='text-2xl font-medium transition-all duration-300 group-hover:text-white group-focus:text-white'>
                          {slide.title}
                        </h3>
                        <div className='flex flex-wrap gap-2 duration-300'>
                          {slide.tags.map((tag, index) => (
                            <Badge
                              key={index}
                              variant='secondary'
                              className='group-hover:bg-primary group-hover:text-primary-foreground group-focus:bg-primary group-focus:text-primary-foreground transition-all duration-300'
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </Card>
                </a>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      </div>
    </section>
  )
}

export default Blog

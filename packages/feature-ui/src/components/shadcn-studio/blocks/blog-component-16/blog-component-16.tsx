'use client'

import { useEffect, useState } from 'react'

import { ArrowLeftIcon, ArrowRightIcon } from 'lucide-react'

import { Card, CardContent } from '@superbuilder/feature-ui/shadcn/card'
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@superbuilder/feature-ui/shadcn/carousel'
import { MotionPreset } from '@superbuilder/feature-ui/shadcn/motion-preset'
import { MatterButton } from '@superbuilder/feature-ui/shadcn/matter-button'
import { TextShimmer } from 'src/components/shadcn-studio/blocks/text-shimmer'

export type BlogPost = {
  title: string
  description: string
  imageUrl: string
  imageAlt: string
  author: string
  blogLink: string
  authorLink: string
}

type BlogCarouselProps = {
  blogPosts: BlogPost[]
}

const BlogCarousel = ({ blogPosts }: BlogCarouselProps) => {
  const [api, setApi] = useState<CarouselApi>()
  const [canScrollPrev, setCanScrollPrev] = useState(false)
  const [canScrollNext, setCanScrollNext] = useState(false)

  useEffect(() => {
    if (!api) {
      return
    }

    const updateScrollState = () => {
      setCanScrollPrev(api.canScrollPrev())
      setCanScrollNext(api.canScrollNext())
    }

    updateScrollState()
    api.on('select', updateScrollState)
    api.on('reInit', updateScrollState)

    return () => {
      api.off('select', updateScrollState)
      api.off('reInit', updateScrollState)
    }
  }, [api])

  return (
    <section className='py-8 sm:py-16 lg:py-24'>
      <Carousel
        setApi={setApi}
        opts={{
          align: 'start'
        }}
        className='md:space-y-6 lg:space-y-8'
      >
        <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
          {/* Header Content */}
          <div className='flex flex-wrap items-end justify-between gap-4'>
            <div className='space-y-4'>
              <MotionPreset fade blur slide={{ direction: 'down', offset: 30 }} transition={{ duration: 0.5 }}>
                <TextShimmer className='text-sm font-medium uppercase' duration={1.75}>
                  Blogs
                </TextShimmer>
              </MotionPreset>

              <MotionPreset
                component='h2'
                className='text-2xl font-semibold md:text-3xl lg:text-4xl'
                fade
                blur
                slide={{ direction: 'down', offset: 40 }}
                delay={0.2}
                transition={{ duration: 0.5 }}
              >
                Discover updates
              </MotionPreset>

              <MotionPreset
                component='p'
                className='text-muted-foreground text-base md:text-lg'
                fade
                blur
                slide={{ direction: 'down', offset: 40 }}
                delay={0.3}
                transition={{ duration: 0.5 }}
              >
                Stay informed with the newest developments and advancements from our team.
              </MotionPreset>
            </div>
            <MotionPreset
              fade
              blur
              slide={{ direction: 'down', offset: 30 }}
              delay={0.4}
              transition={{ duration: 0.5 }}
            >
              <div className='flex items-center gap-4'>
                <MatterButton
                  size='icon-lg'
                  onClick={() => api?.scrollPrev()}
                  disabled={!canScrollPrev}
                  className='disabled:opacity-50 [&>button]:cursor-pointer'
                >
                  <ArrowLeftIcon />
                </MatterButton>
                <MatterButton
                  size='icon-lg'
                  onClick={() => api?.scrollNext()}
                  disabled={!canScrollNext}
                  className='disabled:opacity-50 [&>button]:cursor-pointer'
                >
                  <ArrowRightIcon />
                </MatterButton>
              </div>
            </MotionPreset>
          </div>
        </div>

        {/* Blog Carousel */}
        <MotionPreset
          fade
          blur
          slide={{ direction: 'down', offset: 30 }}
          delay={0.5}
          transition={{ duration: 0.6 }}
          className='h-full'
        >
          <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
            <CarouselContent className='-ml-4 lg:-ml-10'>
              {blogPosts.map((post, index) => (
                <CarouselItem key={index} className='pl-4 md:basis-1/2 lg:basis-1/2 lg:pl-10'>
                  <Card className='h-full overflow-hidden border-none bg-transparent shadow-none'>
                    <CardContent className='space-y-6 px-0'>
                      <div className='overflow-hidden rounded-xl'>
                        <a href={post.blogLink}>
                          <img src={post.imageUrl} alt={post.imageAlt} className='aspect-[16/10] w-full object-cover' />
                        </a>
                      </div>
                      <div className='space-y-2'>
                        <h3 className='text-xl leading-tight font-medium md:text-2xl'>
                          <a href={post.blogLink}>{post.title}</a>
                        </h3>
                        <p className='text-muted-foreground mb-5 leading-relaxed'>{post.description}</p>
                        <p className='text-muted-foreground text-sm font-light'>
                          <a href={post.authorLink}>{post.author}</a>
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </CarouselItem>
              ))}
            </CarouselContent>
          </div>
        </MotionPreset>
      </Carousel>
    </section>
  )
}

export default BlogCarousel

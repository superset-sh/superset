import { ArrowRightIcon } from 'lucide-react'

import { Button } from '@superbuilder/feature-ui/shadcn/button'
import { Card, CardContent, CardTitle, CardDescription, CardHeader } from '@superbuilder/feature-ui/shadcn/card'

import { MotionPreset } from '@superbuilder/feature-ui/shadcn/motion-preset'

type BlogCard = {
  img: string
  alt: string
  title: string
  description: string
  blogLink: string
}[]

const Blog = ({ blogCards }: { blogCards: BlogCard }) => {
  return (
    <section className='py-8 sm:py-16 lg:py-24'>
      <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
        {/* Header */}
        <div className='mb-12 space-y-4 text-center sm:mb-16 lg:mb-24'>
          <MotionPreset fade slide={{ direction: 'down', offset: 50 }} blur transition={{ duration: 0.5 }}>
            <h2 className='text-2xl font-semibold md:text-3xl lg:text-4xl'>
              What We&apos;re{' '}
              <span className='relative z-10'>
                Working
                <span className='bg-primary absolute bottom-0 left-0 -z-10 h-px w-full' aria-hidden='true' />
              </span>
              On
            </h2>
          </MotionPreset>

          <MotionPreset fade slide={{ direction: 'down', offset: 50 }} blur delay={0.3} transition={{ duration: 0.5 }}>
            <p className='text-muted-foreground mx-auto max-w-2xl text-base lg:text-xl'>
              Dive into stories, strategies, and lessons from our team as we design, build, and scale modern digital
              products.
            </p>
          </MotionPreset>

          <MotionPreset fade slide={{ direction: 'down', offset: 50 }} blur delay={0.6} transition={{ duration: 0.5 }}>
            <Button className='group rounded-lg text-base has-[>svg]:px-6' size='lg' render={<a href='#' />} nativeButton={false}>View All Blogs
                                      <ArrowRightIcon className='transition-transform duration-200 group-hover:translate-x-0.5' /></Button>
          </MotionPreset>
        </div>

        <div className='grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3'>
          {blogCards.map((item, index) => (
            <MotionPreset
              key={index}
              fade
              blur
              slide={{ direction: 'up', offset: 50 }}
              delay={0.8 + index * 0.1}
              transition={{ duration: 0.5 }}
            >
              <a href={item.blogLink}>
                <Card className='group gap-4 overflow-hidden border-0 bg-transparent py-0 shadow-none transition-transform duration-300 hover:-translate-y-1'>
                  <CardContent className='px-0'>
                    <div className='relative'>
                      <img src={item.img} alt={item.alt} className='w-full' />
                      <Button
                        size='icon'
                        variant='secondary'
                        className='hover:bg-primary hover:text-primary-foreground group-hover:bg-primary group-hover:text-primary-foreground absolute right-1 bottom-1 size-10 rotate-316 rounded-full transition-colors duration-300 sm:right-6 sm:bottom-6 md:right-2 md:bottom-2 lg:right-1 lg:bottom-1 xl:right-3 xl:bottom-3'
                      >
                        <ArrowRightIcon />
                      </Button>
                    </div>
                  </CardContent>
                  <CardHeader className='px-0'>
                    <CardTitle className='group-hover:text-primary text-2xl font-semibold transition-colors duration-200'>
                      {item.title}
                    </CardTitle>
                    <CardDescription className='text-muted-foreground text-base'>{item.description}</CardDescription>
                  </CardHeader>
                </Card>
              </a>
            </MotionPreset>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Blog

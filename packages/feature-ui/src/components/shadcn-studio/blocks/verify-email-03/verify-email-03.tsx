import { Avatar, AvatarFallback, AvatarImage } from '@superbuilder/feature-ui/shadcn/avatar'
import { Button } from '@superbuilder/feature-ui/shadcn/button'
import { Card, CardContent, CardHeader, CardTitle } from '@superbuilder/feature-ui/shadcn/card'

import Logo from 'src/components/shadcn-studio/logo'
import LogoVector from 'src/assets/svg/logo-vector'

const avatars = [
  {
    src: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-3.png',
    fallback: 'OS',
    name: 'Olivia Sparks'
  },
  {
    src: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-6.png',
    fallback: 'HL',
    name: 'Howard Lloyd'
  },
  {
    src: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-5.png',
    fallback: 'HR',
    name: 'Hallie Richards'
  }
]

const VerifyEmail = () => {
  return (
    <div className='h-dvh lg:grid lg:grid-cols-2'>
      <div className='flex h-full items-center justify-center space-y-6 sm:px-6 md:px-8'>
        <div className='flex w-full flex-col gap-6 p-6 sm:max-w-lg'>
          <Logo className='gap-3' />

          <div>
            <h2 className='mb-1.5 text-2xl font-semibold'>Verify your email 📧</h2>
            <p className='text-muted-foreground'>
              Account activation link sent to your email address.{' '}
              <span className='text-foreground font-semibold'>johndoe@gmail.com</span>, Please follow thee link inside
              to continue.
            </p>
          </div>

          <div className='space-y-4'>
            <Button className='w-full' render={<a href='#' />} nativeButton={false}>Skip for now</Button>

            <p className='text-muted-foreground text-center'>
              Didn&apos;t get the mail?{' '}
              <a href='#' className='text-card-foreground hover:underline'>
                Resend
              </a>
            </p>
          </div>
        </div>
      </div>

      <div className='bg-muted h-screen p-5 max-lg:hidden'>
        <Card className='bg-primary relative h-full justify-between border-none py-8'>
          <CardHeader className='gap-6 px-8'>
            <CardTitle className='text-primary-foreground text-4xl font-bold xl:text-5xl/15.5'>
              Welcome back! Please sign in to your Shadcn Studio account
            </CardTitle>
            <p className='text-primary-foreground text-xl'>
              Thank you for registering! Please check your inbox and click the verification link to activate your
              account.
            </p>
          </CardHeader>

          <LogoVector className='text-secondary/10 pointer-events-none absolute bottom-30 -left-50 size-130' />

          <CardContent className='relative z-1 mx-8 h-62 overflow-hidden rounded-2xl px-0'>
            <svg
              width='1094'
              height='249'
              viewBox='0 0 1094 249'
              fill='none'
              xmlns='http://www.w3.org/2000/svg'
              className='pointer-events-none absolute right-0 -z-1 select-none'
            >
              <path
                d='M0.263672 16.8809C0.263672 8.0443 7.42712 0.880859 16.2637 0.880859H786.394H999.115C1012.37 0.880859 1023.12 11.626 1023.12 24.8808L1023.12 47.3809C1023.12 60.6357 1033.86 71.3809 1047.12 71.3809H1069.6C1082.85 71.3809 1093.6 82.126 1093.6 95.3809L1093.6 232.881C1093.6 241.717 1086.43 248.881 1077.6 248.881H16.2637C7.42716 248.881 0.263672 241.717 0.263672 232.881V16.8809Z'
                fill='var(--card)'
              />
            </svg>

            <div className='bg-card absolute top-0 right-0 flex size-15 items-center justify-center rounded-2xl'>
              <LogoVector className='size-15' />
            </div>

            <div className='flex flex-col gap-5 p-6'>
              <p className='line-clamp-2 pr-12 text-3xl font-bold'>Please enter your login details</p>
              <p className='line-clamp-2 text-lg'>
                Stay connected with shadcn/studio Subscribe now for the latest updates and news.
              </p>

              <div className='flex -space-x-4 self-end'>
                {avatars.map((avatar, index) => (
                  <Avatar key={index} className='ring-background size-12 ring-2'>
                    <AvatarImage src={avatar.src} alt={avatar.name} />
                    <AvatarFallback className='text-xs'>{avatar.fallback}</AvatarFallback>
                  </Avatar>
                ))}
                <Avatar className='ring-background size-12 ring-2'>
                  <AvatarFallback className='text-xs'>+3695</AvatarFallback>
                </Avatar>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default VerifyEmail

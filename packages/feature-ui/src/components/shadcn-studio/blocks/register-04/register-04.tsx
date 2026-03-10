import { Button } from '@superbuilder/feature-ui/shadcn/button'
import { Separator } from '@superbuilder/feature-ui/shadcn/separator'

import RegisterForm from 'src/components/shadcn-studio/blocks/register-04/register-form'

const Register = () => {
  return (
    <div className='h-dvh lg:grid lg:grid-cols-2'>
      {/* Dashboard Preview */}
      <div className='bg-primary flex flex-col items-center justify-between gap-12 p-10 max-lg:hidden xl:p-16'>
        <div className='text-primary-foreground'>
          <h1 className='mb-4 text-3xl font-bold'>Create your account to get started.</h1>
          <p className='text-xl'>
            Your account will allow you to securely save your progress, customize your preferences, and stay connected
            across all your devices.
          </p>
        </div>

        <div className='border-card bg-card flex max-h-118 items-center justify-center rounded-xl border-12'>
          <img
            src='https://cdn.shadcnstudio.com/ss-assets/blocks/marketing/auth/image-1.png'
            alt='dashboard'
            className='size-full rounded-xl object-contain dark:hidden'
          />
          <img
            src='https://cdn.shadcnstudio.com/ss-assets/blocks/marketing/auth/image-1-dark.png'
            alt='dashboard'
            className='hidden size-full rounded-xl object-contain dark:inline-block'
          />
        </div>

        <div className='flex gap-2 rounded-full bg-white/20 px-3 py-2'>
          <a href='#' className='flex size-9 items-center justify-center rounded-full bg-white'>
            <img
              src='https://cdn.shadcnstudio.com/ss-assets/brand-logo/tailwind-logo.png'
              alt='TailwindCSS Logo'
              className='w-7'
            />
          </a>
          <a href='#' className='flex size-9 items-center justify-center rounded-full bg-white'>
            <img
              src='https://cdn.shadcnstudio.com/ss-assets/brand-logo/nextjs-logo.png'
              alt='Next.js Logo'
              className='w-5.5'
            />
          </a>
          <a href='#' className='flex size-9 items-center justify-center rounded-full bg-white'>
            <img
              src='https://cdn.shadcnstudio.com/ss-assets/brand-logo/shadcn-logo.png'
              alt='Shadcn Logo'
              className='w-5.5'
            />
          </a>
        </div>
      </div>

      {/* Register Form */}
      <div className='flex h-full flex-col items-center justify-center py-10 sm:px-5'>
        <div className='flex w-full max-w-lg flex-col gap-6 p-6'>
          <div className='space-y-3 text-center'>
            <h2 className='text-2xl font-semibold md:text-3xl lg:text-4xl'>Create your account 👤</h2>
            <p className='text-muted-foreground'>Lets get started with your 30 days free trial</p>
          </div>

          {/* Quick Login Buttons */}
          <Button variant='outline' className='w-full' render={<a href='#' />} nativeButton={false}>Login with Google</Button>

          <div className='flex items-center gap-4'>
            <Separator className='flex-1' />
            <p>Or</p>
            <Separator className='flex-1' />
          </div>

          <div className='space-y-4'>
            {/* Register Form */}
            <RegisterForm />
            <p className='text-muted-foreground text-center'>
              Already have an account?{' '}
              <a href='#' className='text-foreground hover:underline'>
                Log in
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Register

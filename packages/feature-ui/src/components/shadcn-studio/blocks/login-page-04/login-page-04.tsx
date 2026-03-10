import { Button } from '@superbuilder/feature-ui/shadcn/button'
import { Separator } from '@superbuilder/feature-ui/shadcn/separator'

import LoginForm from 'src/components/shadcn-studio/blocks/login-page-04/login-form'

const Login = () => {
  return (
    <div className='h-dvh lg:grid lg:grid-cols-2'>
      {/* Dashboard Preview */}
      <div className='bg-primary flex flex-col items-center justify-between gap-12 p-10 max-lg:hidden xl:p-16'>
        <div className='text-primary-foreground'>
          <h1 className='mb-6 text-3xl font-bold'>Welcome back! Please sign in to your Shadcn Studio account</h1>
          <p className='text-xl'>
            Thank you for registering! Please check your inbox and click the verification link to activate your account.
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

      {/* Login Form */}
      <div className='flex h-full flex-col items-center justify-center py-10 sm:px-5'>
        <div className='flex w-full max-w-lg flex-col gap-6 p-6'>
          <div className='space-y-3 text-center'>
            <h2 className='text-2xl font-semibold md:text-3xl lg:text-4xl'>Welcome Back 👋</h2>
            <p className='text-muted-foreground'>Lets get started with your 30 days free trial</p>
          </div>

          {/* Quick Login Buttons */}
          <div className='flex flex-col gap-3'>
            <Button variant='outline' className='grow' render={<a href='#' />} nativeButton={false}>Login with Google</Button>
            <Button variant='outline' className='grow' render={<a href='#' />} nativeButton={false}>Login with Facebook</Button>
          </div>

          <div className='flex items-center gap-4'>
            <Separator className='flex-1' />
            <p>Or</p>
            <Separator className='flex-1' />
          </div>

          <div className='space-y-4'>
            {/* Form */}
            <LoginForm />

            <p className='text-muted-foreground text-center'>
              Don&apos;t have an account yet?{' '}
              <a href='#' className='text-foreground hover:underline'>
                Sign Up
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login

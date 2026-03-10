import { Button } from '@superbuilder/feature-ui/shadcn/button'

import ForgotPasswordForm from 'src/components/shadcn-studio/blocks/forgot-password-04/forgot-password-form'

const ForgotPassword = () => {
  return (
    <div className='h-dvh lg:grid lg:grid-cols-2'>
      {/* Dashboard Preview */}
      <div className='bg-primary flex flex-col items-center justify-between gap-12 p-10 max-lg:hidden xl:p-16'>
        <div className='text-primary-foreground'>
          <h1 className='mb-6 text-3xl font-bold'>
            Don&apos;t worry it happens! Resetting your password is quick and easy.
          </h1>
          <p className='text-xl'>
            Just enter your registered email address below, and we&apos;ll send you a secure link to reset your
            password. Follow the instructions in the email, and you&apos;ll be back in your account in no time!
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

      {/* ForgotPassword Form */}
      <div className='flex h-full flex-col items-center justify-center py-10 sm:px-5'>
        <div className='flex w-full max-w-lg flex-col gap-6 p-6'>
          <div className='space-y-3 text-center'>
            <h2 className='text-2xl font-semibold md:text-3xl lg:text-4xl'>Forgot Password ? 🔒</h2>
            <p className='text-muted-foreground'>No worries, we&apos;ll send you reset instructions.</p>
          </div>

          <div className='space-y-4'>
            {/* Form */}
            <ForgotPasswordForm />

            <Button variant='ghost' className='w-full' render={<a href='#' />} nativeButton={false}>Back to login</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ForgotPassword

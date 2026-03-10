import { Button } from '@superbuilder/feature-ui/shadcn/button'

import ResetPasswordForm from 'src/components/shadcn-studio/blocks/reset-password-04/reset-password-form'

const ResetPassword = () => {
  return (
    <div className='h-dvh lg:grid lg:grid-cols-2'>
      {/* Dashboard Preview */}
      <div className='bg-primary flex flex-col items-center justify-between gap-12 p-10 max-lg:hidden xl:p-16'>
        <div className='text-primary-foreground'>
          <h1 className='mb-6 text-3xl font-bold'>
            You&apos;re just one step away from regaining access to your account.
          </h1>
          <p className='text-xl'>
            Please create a new password below. Make sure it&apos;s strong and secure, combining letters, numbers, and
            special characters.
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

      {/* ResetPassword Form */}
      <div className='flex h-full flex-col items-center justify-center py-10 sm:px-5'>
        <div className='flex w-full max-w-lg flex-col gap-6 p-6'>
          <div className='space-y-3 text-center'>
            <h2 className='text-2xl font-semibold md:text-3xl lg:text-4xl'>Set new password 🔑</h2>
            <p className='text-muted-foreground'>Must be at last 8 characters.</p>
          </div>

          <div className='space-y-4'>
            {/* Form */}
            <ResetPasswordForm />

            <Button variant='ghost' className='w-full' render={<a href='#' />} nativeButton={false}>Back to login</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ResetPassword

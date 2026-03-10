'use client'

import { Button } from '@superbuilder/feature-ui/shadcn/button'
import { Input } from '@superbuilder/feature-ui/shadcn/input'
import { Label } from '@superbuilder/feature-ui/shadcn/label'

const ForgotPasswordForm = () => {
  return (
    <form className='space-y-4' onSubmit={e => e.preventDefault()}>
      {/* Email */}
      <div className='space-y-1'>
        <Label className='leading-5' htmlFor='userEmail'>
          Email address*
        </Label>
        <Input type='email' id='userEmail' placeholder='Enter your email address' />
      </div>

      <Button className='w-full' type='submit'>
        Send Reset Link
      </Button>
    </form>
  )
}

export default ForgotPasswordForm

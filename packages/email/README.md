# @superset/email

Email templates for Superset, built with [React Email](https://react.email).

## Images in Email

**Critical:** Email clients require absolute URLs for images. All images must be hosted on your production domain.

### Image Setup
1. Generate PNG assets (email clients don't support SVG):
   - Header logo (`logo.png`): 240x240px
   - Footer logo (`logo-full.png`): 512x83px (pixelated SUPERSET text)
   - Social icons: 48x48px (displayed at 24x24 for retina)
2. Place in `apps/marketing/public/assets/emails/`
3. Images load from `https://superset.sh/assets/emails/` in production

### Environment Variables

The email package reads `NEXT_PUBLIC_MARKETING_URL` from the root `.env` file to construct absolute image URLs.

**For local development:**
The React Email dev server automatically loads `NEXT_PUBLIC_MARKETING_URL` from the monorepo root `.env`:
```bash
NEXT_PUBLIC_MARKETING_URL=http://localhost:3002  # Marketing app port
```

**For production:**
Set in your deployment environment:
```bash
NEXT_PUBLIC_MARKETING_URL=https://superset.sh
```

**Note:** For actual email sending, the environment variable should be set in your API/backend service.

## Structure

```
packages/email/
├── emails/                      # Email templates (create new emails here)
│   └── welcome.tsx              # Example welcome email
├── components/                  # Reusable components
│   ├── layout/
│   │   └── StandardLayout/      # Base layout with header/footer
│   │       ├── StandardLayout.tsx
│   │       └── components/
│   │           └── Footer/      # Footer component (co-located)
│   └── ui/
│       ├── Button/              # Reusable button component
│       └── Logo/                # Header logo component
└── src/                         # Source files
    └── lib/                     # Utilities (colors, env config)
```

**Note**: React Email CLI expects `emails/` and `components/` at the package root.

## StandardLayout

All emails use a single standard layout with:
- **Header**: Company logo
- **Content Area**: Your email content (passed as children)
- **Footer**: Links, company info, unsubscribe

This ensures consistent branding across all transactional emails.

## Creating New Email Templates

1. Create a new file in `emails/`:

```tsx
// emails/password-reset.tsx
import { Heading, Link, Text } from "@react-email/components";
import { StandardLayout } from "../components/layout/StandardLayout";
import { Button } from "../components/ui/Button";

interface PasswordResetEmailProps {
  resetLink: string;
  userName: string;
}

export function PasswordResetEmail({
  resetLink,
  userName
}: PasswordResetEmailProps) {
  return (
    <StandardLayout preview="Reset your password">
      <Heading className="text-foreground text-[28px] font-semibold leading-tight m-0 mb-6">
        Reset your password
      </Heading>

      <Text className="text-[#515759] text-base leading-snug m-0 mb-4">
        Hi {userName},
      </Text>

      <Text className="text-[#515759] text-base leading-snug m-0 mb-4">
        We received a request to reset your password.
        Click the button below to create a new password:
      </Text>

      <Button href={resetLink}>Reset Password</Button>

      <Text className="text-muted text-sm leading-snug m-0 mt-6">
        This link will expire in 1 hour. If you didn't request this,
        you can safely ignore this email.
      </Text>
    </StandardLayout>
  );
}

// Required for React Email preview
export default PasswordResetEmail;
```

2. The template will automatically appear in the preview server (if using npm).

## Using Emails in Your App

```tsx
// apps/api/src/routes/auth.ts
import { WelcomeEmail } from "@superset/email/emails/welcome";
import { render } from "@react-email/render";

// Render to HTML
const html = render(<WelcomeEmail userName="Satya" />);

// Send with your email provider (e.g., Resend, SendGrid)
await resend.emails.send({
  from: "noreply@superset.sh",
  to: user.email,
  subject: "Welcome to Superset!",
  html,
});
```

## Components

### StandardLayout

The base layout that wraps all email templates.

**Props:**
- `preview` (string): Preview text shown in email client
- `children` (ReactNode): Email content

**Features:**
- Logo header
- Subtle divider line
- Flexible content area
- Footer with links and company info

### Button

Primary and secondary button styles.

**Props:**
- `href` (string): Link URL
- `variant` ("primary" | "secondary"): Button style (default: "primary")
- `children` (ReactNode): Button text

**Example:**
```tsx
<Button href="https://app.superset.sh">Get Started</Button>
<Button href="https://superset.sh" variant="secondary">
  Learn More
</Button>
```

## Design System

Uses Tailwind CSS via `@react-email/tailwind` component:

**Colors** (from app theme):
- Background: `#FFFFFF`
- Foreground: `#212121`
- Primary: `#323232`
- Muted: `#888888`
- Border: `#EBEBEB`

**Layout:**
- Container: 600px max-width
- Border radius: 12px
- Padding: 36px horizontal
- Font: System fonts

## Next Templates to Create

Common transactional emails to add:

1. **Authentication:**
   - Email verification
   - Magic link login
   - Password reset ✅ (example above)
   - Two-factor authentication code

2. **Team & Collaboration:**
   - Workspace invite
   - Task assigned
   - Mention notification

3. **Billing:**
   - Subscription receipt
   - Payment failed
   - Trial ending

4. **System:**
   - Weekly digest
   - Security alert
   - Account deleted confirmation

## Testing

To preview email templates during development:

```bash
bun --filter=@superset/email dev
```

Then:
1. Create your email template in `emails/`
2. Preview at http://localhost:3000
3. Test HTML rendering with `@react-email/render`
4. Send test emails before production use

React Email components are tested across major email clients (Gmail, Outlook, Apple Mail, etc.).

/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
  recipient?: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
  recipient,
}: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your TEX travel & expense account is ready — accept your invitation</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={logo}>TEX</Text>
        <Heading style={h1}>Welcome to TEX</Heading>
        <Text style={text}>
          {recipient ? <>Hi {recipient},<br /><br /></> : null}
          Your administrator has created a TEX account for you. TEX is the travel
          and expense platform your organisation uses to submit receipts, track
          trips, and get reimbursed.
        </Text>
        <Text style={text}>
          To finish setting up your account, choose a password using the secure
          link below. This link is unique to you — please don't share it.
        </Text>
        <Section style={{ textAlign: 'center', margin: '28px 0' }}>
          <Button style={button} href={confirmationUrl}>
            Set your password
          </Button>
        </Section>
        <Text style={smallText}>
          Button not working? Copy and paste this link into your browser:
        </Text>
        <Text style={urlText}>
          <Link href={confirmationUrl} style={urlLink}>{confirmationUrl}</Link>
        </Text>
        <Hr style={hr} />
        <Text style={footer}>
          You're receiving this email because someone at your company invited you
          to join TEX at <Link href={siteUrl} style={urlLink}>{siteUrl}</Link>.
          If you weren't expecting this invitation you can safely ignore this
          message — no account will be created without action from you.
        </Text>
        <Text style={footer}>
          Need help? Reply to this email or contact your TEX administrator.
        </Text>
        <Text style={signature}>
          — The TEX Team<br />
          Powered by Torrevie · <Link href="https://torrevie.com" style={urlLink}>torrevie.com</Link>
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '32px 25px', maxWidth: '560px' }
const logo = {
  fontSize: '28px',
  fontWeight: 'bold' as const,
  color: '#0D9488',
  margin: '0 0 24px',
  textAlign: 'center' as const,
  letterSpacing: '2px',
}
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#0D1B3E',
  margin: '0 0 20px',
}
const text = {
  fontSize: '15px',
  color: '#334155',
  lineHeight: '1.6',
  margin: '0 0 16px',
}
const smallText = {
  fontSize: '13px',
  color: '#64748b',
  lineHeight: '1.5',
  margin: '20px 0 4px',
}
const urlText = {
  fontSize: '13px',
  wordBreak: 'break-all' as const,
  margin: '0 0 20px',
}
const urlLink = { color: '#0D9488', textDecoration: 'underline' }
const button = {
  backgroundColor: '#0D9488',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 'bold' as const,
  borderRadius: '8px',
  padding: '14px 28px',
  textDecoration: 'none',
  display: 'inline-block',
}
const hr = { borderColor: '#e2e8f0', margin: '28px 0' }
const footer = { fontSize: '12px', color: '#94a3b8', margin: '0 0 12px', lineHeight: '1.5' }
const signature = { fontSize: '12px', color: '#64748b', margin: '20px 0 0', lineHeight: '1.5' }

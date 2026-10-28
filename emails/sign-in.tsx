import React from 'react';
import {
  Body,
  Button,
  Container,
  Font,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
  pixelBasedPreset,
} from 'react-email';

export type SignInEmailProps = { verificationUrl: string; firstVisit?: boolean };

// Email-safe sRGB equivalents of the shared neutral tokens in tokens.css.
const colors = {
  paper: '#ffffff',
  surface: '#ffffff',
  ink: '#202020',
  muted: '#626262',
  rule: '#dedede',
  action: '#252525',
  onAction: '#ffffff',
};
const fonts = {
  body: 'Inter, Arial, Helvetica, sans-serif',
  brand: 'Figtree, Arial, Helvetica, sans-serif',
};
const googleFonts = {
  brand: 'https://fonts.gstatic.com/s/figtree/v9/_Xmz-HUzqDCFdgfMsYiV_F7wfS-Bs_ehR15e.ttf',
  regular:
    'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf',
  medium:
    'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fMZg.ttf',
  semibold:
    'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYMZg.ttf',
};
export default function SignInEmail({ verificationUrl, firstVisit = false }: SignInEmailProps) {
  return (
    <Html lang="en" dir="ltr">
      <Tailwind config={{ presets: [pixelBasedPreset] }}>
        <Head>
          <meta name="color-scheme" content="light" />
          <meta name="supported-color-schemes" content="light" />
          <Font
            fontFamily="Figtree"
            fallbackFontFamily="Arial"
            fontWeight={600}
            webFont={{ url: googleFonts.brand, format: 'truetype' }}
          />
          <Font
            fontFamily="Inter"
            fallbackFontFamily="Arial"
            fontWeight={400}
            webFont={{ url: googleFonts.regular, format: 'truetype' }}
          />
          <Font
            fontFamily="Inter"
            fallbackFontFamily="Arial"
            fontWeight={500}
            webFont={{ url: googleFonts.medium, format: 'truetype' }}
          />
          <Font
            fontFamily="Inter"
            fallbackFontFamily="Arial"
            fontWeight={600}
            webFont={{ url: googleFonts.semibold, format: 'truetype' }}
          />
        </Head>
        <Body
          style={{
            backgroundColor: colors.paper,
            margin: 0,
            padding: '32px 16px',
            color: colors.ink,
            fontFamily: fonts.body,
          }}
        >
          <Preview>
            {firstVisit
              ? 'Confirm your email to start your personal film library.'
              : 'Your one-time sign-in link to A-List is inside.'}
          </Preview>
          <Container style={{ maxWidth: '520px', width: '100%', margin: '0 auto' }}>
            <Section style={{ padding: '8px 8px 24px' }}>
              <Text
                style={{
                  fontFamily: fonts.brand,
                  fontWeight: 600,
                  fontSize: '30px',
                  lineHeight: '36px',
                  letterSpacing: '-1.35px',
                  margin: 0,
                  color: colors.ink,
                }}
              >
                A-List
              </Text>
            </Section>
            <Section
              style={{
                padding: '32px 24px',
                backgroundColor: colors.surface,
                border: `1px solid ${colors.rule}`,
                borderRadius: '16px',
              }}
            >
              <Heading
                as="h1"
                style={{
                  fontFamily: fonts.body,
                  fontWeight: 600,
                  fontSize: '26px',
                  lineHeight: '34px',
                  letterSpacing: '-0.8px',
                  margin: '0 0 16px',
                  color: colors.ink,
                }}
              >
                {firstVisit ? 'Your library starts here.' : 'Welcome back.'}
              </Heading>
              <Text
                style={{
                  fontFamily: fonts.body,
                  color: colors.muted,
                  fontSize: '16px',
                  lineHeight: '26px',
                  margin: '0 0 24px',
                }}
              >
                {firstVisit
                  ? 'Confirm your email to save the films you want to see and follow their digital and streaming releases.'
                  : 'Sign in to your personal library and the films you’re looking forward to.'}
              </Text>
              <Button
                href={verificationUrl}
                className="box-border"
                style={{
                  backgroundColor: colors.action,
                  color: colors.onAction,
                  fontFamily: fonts.body,
                  fontSize: '15px',
                  fontWeight: 500,
                  lineHeight: '22px',
                  padding: '14px 24px',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  textAlign: 'center',
                }}
              >
                {firstVisit ? 'Confirm & open A-List' : 'Sign in to A-List'}
              </Button>
              <Text
                style={{
                  fontFamily: fonts.body,
                  color: colors.muted,
                  fontSize: '13px',
                  lineHeight: '22px',
                  margin: '20px 0 28px',
                }}
              >
                Open this link on the device where you want to use A-List, then confirm the sign-in.
                It works once, so keep it to yourself.
              </Text>
              <Hr style={{ border: 'none', borderTop: `1px solid ${colors.rule}`, margin: 0 }} />
              <Text
                style={{
                  fontFamily: fonts.body,
                  color: colors.muted,
                  fontSize: '13px',
                  lineHeight: '22px',
                  margin: '24px 0 12px',
                }}
              >
                Button not opening?{' '}
                <Link
                  href={verificationUrl}
                  style={{ fontFamily: fonts.body, color: colors.ink, textDecoration: 'underline' }}
                >
                  Use your sign-in link
                </Link>
                .
              </Text>
              <Text
                style={{
                  fontFamily: fonts.body,
                  color: colors.muted,
                  fontSize: '13px',
                  lineHeight: '22px',
                  margin: 0,
                }}
              >
                If you didn’t request this email, you can safely ignore it.
              </Text>
            </Section>
            <Text
              style={{
                fontFamily: fonts.body,
                color: colors.muted,
                fontSize: '12px',
                lineHeight: '20px',
                textAlign: 'center',
                margin: '24px 0 0',
              }}
            >
              Your films. Your next movie night.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
SignInEmail.PreviewProps = {
  verificationUrl: 'https://example.com/auth/verify-preview',
  firstVisit: false,
} satisfies SignInEmailProps;

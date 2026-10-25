import React from 'react';
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
  Tailwind,
  Text,
  pixelBasedPreset,
} from 'react-email';

export type SignInEmailProps = {
  verificationUrl: string;
  firstVisit?: boolean;
};

// sRGB equivalents of A-List's newsprint tokens; email clients need hex colors.
const colors = {
  paper: '#faf5ed',
  ink: '#27201a',
  muted: '#675f56',
  rule: '#d5cdc0',
  rust: '#9f351b',
};
const sans = 'Arial, Helvetica, sans-serif';
const serif = 'Georgia, "Times New Roman", serif';

export default function SignInEmail({ verificationUrl, firstVisit = false }: SignInEmailProps) {
  return (
    <Html lang="en" dir="ltr">
      <Tailwind config={{ presets: [pixelBasedPreset] }}>
        <Head>
          <meta name="color-scheme" content="light" />
          <meta name="supported-color-schemes" content="light" />
        </Head>
        <Body
          style={{
            backgroundColor: colors.paper,
            margin: 0,
            padding: '24px 12px',
            color: colors.ink,
            fontFamily: sans,
          }}
        >
          <Preview>
            {firstVisit
              ? 'Confirm your email and start your own film library.'
              : 'Your one-time link to your film library is inside.'}
          </Preview>
          <Section lang="en" dir="ltr">
            <Container style={{ maxWidth: '560px', width: '100%', margin: '0 auto' }}>
              <Section style={{ padding: '12px 20px 0' }}>
                <Text
                  style={{
                    fontFamily: serif,
                    fontSize: '38px',
                    lineHeight: '44px',
                    letterSpacing: '-2px',
                    margin: '0 0 24px',
                  }}
                >
                  A-List<span style={{ color: colors.rust }}>.</span>
                </Text>
                <Hr style={{ border: 'none', borderTop: `1px solid ${colors.ink}`, margin: 0 }} />
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: '11px',
                    lineHeight: '18px',
                    letterSpacing: '1.5px',
                    margin: '18px 0 34px',
                  }}
                >
                  GOOD FILMS. WORTH THE WAIT.
                </Text>
                <Heading
                  as="h1"
                  style={{
                    fontFamily: serif,
                    fontWeight: 400,
                    fontSize: '38px',
                    lineHeight: '42px',
                    letterSpacing: '-1px',
                    margin: '0 0 20px',
                    maxWidth: '410px',
                  }}
                >
                  {firstVisit ? 'Your next movie night starts here.' : 'Back for something good.'}
                </Heading>
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: '16px',
                    lineHeight: '25px',
                    margin: '0 0 28px',
                    maxWidth: '440px',
                  }}
                >
                  {firstVisit
                    ? 'Confirm your email to save the films you want to see and follow their journey from the big screen to yours.'
                    : 'Your library is waiting. Use your one-time sign-in link to pick up where you left off.'}
                </Text>
                <Button
                  href={verificationUrl}
                  className="box-border"
                  style={{
                    backgroundColor: colors.rust,
                    color: '#ffffff',
                    fontFamily: sans,
                    fontSize: '15px',
                    fontWeight: 600,
                    lineHeight: '20px',
                    padding: '15px 24px',
                    borderRadius: '3px',
                    textDecoration: 'none',
                    textAlign: 'center',
                  }}
                >
                  {firstVisit ? 'Confirm & open A-List' : 'Sign in to A-List'}
                </Button>
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: '13px',
                    lineHeight: '21px',
                    margin: '20px 0 36px',
                    maxWidth: '410px',
                  }}
                >
                  Open this link in the browser where you requested it. It works once, so keep it to
                  yourself.
                </Text>
                <Hr style={{ border: 'none', borderTop: `1px solid ${colors.rule}`, margin: 0 }} />
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: '13px',
                    lineHeight: '21px',
                    margin: '22px 0 12px',
                  }}
                >
                  Button not opening?{' '}
                  <Link
                    href={verificationUrl}
                    style={{ color: colors.rust, textDecoration: 'underline' }}
                  >
                    Use your sign-in link
                  </Link>
                  .
                </Text>
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: '13px',
                    lineHeight: '21px',
                    margin: '0 0 26px',
                  }}
                >
                  If you didn’t request this email, you can safely ignore it.
                </Text>
                <Text
                  style={{
                    fontFamily: serif,
                    color: colors.ink,
                    fontStyle: 'italic',
                    fontSize: '17px',
                    lineHeight: '24px',
                    margin: '0 0 10px',
                  }}
                >
                  Keep something good to look forward to.
                </Text>
              </Section>
            </Container>
          </Section>
        </Body>
      </Tailwind>
    </Html>
  );
}

SignInEmail.PreviewProps = {
  verificationUrl: 'https://example.com/auth/verify-preview',
  firstVisit: false,
} satisfies SignInEmailProps;

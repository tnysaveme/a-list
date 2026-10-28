import React from 'react';
import { mkdir, writeFile } from 'node:fs/promises';
import { render } from 'react-email';
import SignInEmail from '../emails/sign-in';

const output = new URL('../supabase/templates/', import.meta.url);
const previews = new URL('../outputs/emails/', import.meta.url);
await Promise.all([mkdir(output, { recursive: true }), mkdir(previews, { recursive: true })]);

for (const [name, firstVisit] of [
  ['confirmation', true],
  ['magic_link', false],
] as const) {
  // Redeem only after the recipient confirms on our page, without a browser-bound PKCE verifier.
  const props = {
    verificationUrl: '{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email',
    firstVisit,
  };
  const html = await render(<SignInEmail {...props} />, { pretty: true });
  const text = await render(<SignInEmail {...props} />, { plainText: true });
  const preview = await render(
    <SignInEmail {...props} verificationUrl="https://example.com/auth/verify-preview" />,
  );
  await Promise.all([
    writeFile(new URL(`${name}.html`, output), html),
    writeFile(new URL(`${name}.txt`, previews), text),
    writeFile(new URL(`${name}.html`, previews), preview),
  ]);
  console.log(`${name}: ${Buffer.byteLength(html)} bytes`);
}

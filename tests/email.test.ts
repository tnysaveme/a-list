import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('both auth templates retain Supabase verification links and an accessible email structure', async () => {
  for (const name of ['confirmation', 'magic_link']) {
    const html = await readFile(
      new URL(`../supabase/templates/${name}.html`, import.meta.url),
      'utf8',
    );
    assert.equal(
      (
        html.match(
          /href="\{\{ \.SiteURL \}\}\/auth\/confirm\?token_hash=\{\{ \.TokenHash \}\}&amp;type=email"/g,
        ) || []
      ).length,
      2,
    );
    assert.doesNotMatch(html, /ConfirmationURL|browser where you requested/);
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1);
    assert.match(html, /<html[^>]+lang="en"/);
    assert.match(html, /If you didn’t request this email/);
    assert.ok(Buffer.byteLength(html) < 102_400, 'must fit below Gmail clipping threshold');
    assert.doesNotMatch(html, /https?:\/\/example\.com|localhost|<script[\s>]|<img[\s>]/i);
  }
});

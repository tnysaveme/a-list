// Only the test-server process imports this. Application code has no test-auth bypass.
const original = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url || String(input));
  if (url.hostname === 'www.dvdsreleasedates.com' && /\/movies\//.test(url.pathname))
    return original('http://127.0.0.1:4318/source?url=' + encodeURIComponent(url.href), {
      signal: init?.signal,
    });
  if (!['127.0.0.1', 'localhost'].includes(url.hostname))
    return Promise.reject(new Error('External provider blocked by isolated browser fixture'));
  return original(input, init);
};

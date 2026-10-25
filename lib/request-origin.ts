export function sameOrigin(
  request: Request,
  options = { vercel: process.env.VERCEL === '1', appUrl: process.env.ALIST_APP_URL },
) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const received = new URL(origin);
    if (received.origin !== origin) return false;
    if (options.vercel)
      return !!options.appUrl && received.origin === new URL(options.appUrl).origin;
    // Next's local Request URL can use localhost while the browser uses 127.0.0.1.
    // Accept loopback only when it also matches the HTTP Host header and port.
    if (
      received.protocol === 'http:' &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(received.hostname)
    )
      return received.host === request.headers.get('host');
    return received.origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

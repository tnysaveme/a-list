/** The interface uses the full wordmark; the compact A is reserved for browser/app icons. */
export function Wordmark({ className = '' }: { className?: string }) {
  return <span className={`brand-wordmark ${className}`.trim()}>A-List</span>;
}

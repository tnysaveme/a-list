/** The A-List identity is always a word, never a symbol or monogram. */
export function Wordmark({ className = '' }: { className?: string }) {
  return <span className={`brand-wordmark ${className}`.trim()}>A-List</span>;
}

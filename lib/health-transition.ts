export type MonitorState = { status: 'healthy' | 'degraded'; issues: string[] };
export function healthTransition(previous: MonitorState | undefined, current: MonitorState) {
  const fingerprint = (value: MonitorState) =>
    JSON.stringify({ status: value.status, issues: [...value.issues].sort() });
  if (previous && fingerprint(previous) === fingerprint(current)) return null;
  return {
    event:
      current.status === 'healthy'
        ? previous
          ? 'source_health_recovered'
          : 'source_health_initialized'
        : 'source_health_degraded',
    issues: current.issues,
  };
}

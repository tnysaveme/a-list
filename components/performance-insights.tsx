'use client';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { sanitizePerformanceEvent } from '../lib/performance-event';

export function PerformanceInsights() {
  return <SpeedInsights sampleRate={0.5} debug={false} beforeSend={sanitizePerformanceEvent} />;
}

'use client';

import { useSyncExternalStore } from 'react';
import {
  currentAppearance,
  setAppearance,
  subscribeAppearance,
  type Appearance,
} from '../lib/appearance';

const options = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const;
const serverAppearance = (): Appearance => 'system';

export function AppearanceSetting() {
  const preference = useSyncExternalStore(subscribeAppearance, currentAppearance, serverAppearance);
  return (
    <section className="account-section appearance-section" aria-labelledby="appearance-title">
      <h3 id="appearance-title">Appearance</h3>
      <p id="appearance-description">Choose a theme for this browser.</p>
      <fieldset className="appearance-pill" aria-describedby="appearance-description">
        <legend className="sr-only">Color theme</legend>
        {options.map(({ value, label }) => (
          <label className="appearance-option" key={value}>
            <input
              type="radio"
              name="appearance"
              value={value}
              checked={preference === value}
              onChange={() => setAppearance(value)}
            />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
    </section>
  );
}

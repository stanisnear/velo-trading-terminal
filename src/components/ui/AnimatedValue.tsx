import React from 'react';
import { RollingNumber, RollingText } from '@kitlangton/rolling-number/react';
import '@kitlangton/rolling-number/styles.css';

// Animate the presentation only: account calculations keep their original values.
// The engine handles interruptions, offscreen values and reduced-motion settings.
export const AnimatedValue = React.memo(function AnimatedValue({ value, currency = true, digits = 2 }: {
  value: number; currency?: boolean; digits?: number;
}) {
  return <span className="velo-rolling-value">{currency && '$'}<RollingNumber value={Number.isFinite(value) ? value : 0}
    duration={340} format={{ minimumFractionDigits: digits, maximumFractionDigits: digits }}/></span>;
});

/** Existing formatting is preserved, including localized units, signs and precision. */
export const AnimatedText = React.memo(function AnimatedText({ text }: { text: string | number | boolean | null | undefined }) {
  const value = text == null || typeof text === 'boolean' ? '' : String(text);
  return <RollingText className="velo-rolling-text" text={value} transition="direct" duration={300} pauseOffscreen />;
});

import React from 'react';
import { RollingNumber } from '@kitlangton/rolling-number/react';
import '@kitlangton/rolling-number/styles.css';

// Animate the presentation only: account calculations keep their original values.
// The engine handles interruptions, offscreen values and reduced-motion settings.
export const AnimatedValue = React.memo(function AnimatedValue({ value, currency = true, digits = 2 }: {
  value: number; currency?: boolean; digits?: number;
}) {
  return <span className="velo-rolling-value">{currency && '$'}<RollingNumber value={Number.isFinite(value) ? value : 0}
    duration={340} format={{ minimumFractionDigits: digits, maximumFractionDigits: digits }}/></span>;
});

export function latestCandleVisible(range, length) {
  const last = length - 1;
  return !!range && length > 0 && range.from <= last + .5 && range.to >= last - .5;
}
export function latestCandleRange(length, visibleBars = 600) {
  return {from:Math.max(0,length-Math.min(visibleBars,length)),to:length+4};
}

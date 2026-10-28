export type ChartPalette = { background:string; foreground:string; grid:string; up:string; down:string };
export const chartPaletteFallback:ChartPalette = {
  background:'#191c1b',foreground:'#abb5ad',grid:'rgba(224,234,226,.055)',up:'#91b99f',down:'#c78580',
};
/** CSS owns the palette; canvas receives resolved literal colors. */
export function readChartPalette(element:Element):ChartPalette {
  const style=getComputedStyle(element);
  const color=(name:string,fallback:string)=>style.getPropertyValue(name).trim()||fallback;
  return {background:color('--chart-surface',chartPaletteFallback.background),foreground:color('--chart-text',chartPaletteFallback.foreground),
    grid:color('--chart-grid',chartPaletteFallback.grid),up:color('--chart-up',chartPaletteFallback.up),down:color('--chart-down',chartPaletteFallback.down)};
}

/** The interface palette as the colour slider knows it. `src/index.css` (@theme and :root) holds the same values for the stylesheet: a test keeps the two in step. */
// the palette's own colors; each keeps its lightness and saturation and only turns round the color wheel
export const TOKENS: Record<string, string> = {
  '--color-lilac-50': '#f8f3fd',
  '--color-lilac-100': '#f0e7fa',
  '--color-lilac-200': '#e1d0f4',
  '--color-lilac-300': '#cdb1eb',
  '--color-lilac-400': '#b78fdf',
  '--color-lilac-500': '#9f6fcd',
  '--color-lilac-600': '#8656b6',
  '--color-lilac-700': '#6b4491',
  '--color-ink': '#3d3150',
  '--color-ink-soft': '#7b6e8e',
  '--color-ink-faint': '#a99fba',
}
// the same colors as "r g b", for the translucent shadows and glows written as rgb(var(--lr-x) / alpha)
export const RGB: Record<string, [number, number, number]> = {
  '--lr-200': [225, 208, 244],
  '--lr-300': [205, 177, 235],
  '--lr-400': [183, 143, 223],
  '--lr-500': [159, 111, 205],
  '--lr-700': [107, 68, 145],
  '--lr-glass': [120, 80, 170],
  '--lr-deep': [70, 35, 110],
}


# Flower artwork

One SVG per flower, so they can be edited in Illustrator, Figma, Inkscape or by hand. The app loads
these files directly (`src/ui/Flower.tsx`): save a file and the flower changes everywhere.

**Canvas:** `viewBox="-12 -12 24 24"`, centred on the origin, petals pointing up (−y).

**Colour:** each fill/stroke has a plain fallback colour (so the file looks right on its own) and a
`style` that takes the folder's colour from a CSS variable:

| Variable | Meaning |
| --- | --- |
| `--flower-base` | the main petal colour |
| `--flower-light` | highlights, inner petals |
| `--flower-deep` | veins, stems, dark centres |
| `--flower-cream` | pale centres |

Fixed colours (a daisy's yellow eye, a white highlight) are written as plain colours.

**Repeated petals:** draw one petal inside `<defs>` with an `id`, then a ring group:

```svg
<g data-ring="daisy-petal" data-count="12" data-offset="0" data-variable>
  <use href="#daisy-petal" transform="rotate(0)"/> … one <use> per petal …
</g>
```

* `data-count` – how many copies (the `<use>` elements are the default; the app regenerates them).
* `data-offset` – starting angle in degrees, or `half` to sit between the petals of another ring.
* `data-variable` – the app may change this ring's count (this is how petal count can carry meaning).

Give ids a prefix with the flower's name: all flowers share one HTML page, so ids must be unique.

Shapes not made of repeated petals (tulip, bluebell) are plain drawings.

import { FLOWER_SHAPES, Flower, type FlowerShape } from './Flower'

const HUES = [285, 320, 345, 20, 40, 90, 150, 175, 200, 230, 255, 300, 10]

/** Design sheet for comparing flower shapes: open the app at /#flowers. */
export function FlowerGallery() {
  return (
    <div className="fixed inset-0 overflow-y-auto" style={{ background: 'inherit' }}>
      <div className="mx-auto max-w-5xl px-5 py-8">
        <h1 className="font-display text-4xl italic text-lilac-700">Flower shapes</h1>
        <p className="mt-1 text-sm text-ink-soft">Twelve silhouettes to choose from. They don’t have to be real species, just clearly different from each other. The artwork is editable SVG in <code>src/assets/flowers/</code>.</p>

        <h2 className="mb-3 mt-8 font-display text-xl">The set</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {FLOWER_SHAPES.map((s, i) => (
            <div key={s.id} className="glass rounded-3xl p-4">
              <div className="flex items-center justify-center py-1">
                <Flower hue={HUES[i % HUES.length]} shape={s.id} size={84} />
              </div>
              <div className="mt-2 flex items-end justify-between">
                <span className="font-display text-lg">{s.label}</span>
                <span className="flex items-center gap-2">
                  <Flower hue={HUES[i % HUES.length]} shape={s.id} size={32} />
                  <Flower hue={HUES[i % HUES.length]} shape={s.id} size={18} />
                  <span style={{ filter: 'grayscale(1)' }} title="Greyscale">
                    <Flower hue={HUES[i % HUES.length]} shape={s.id} size={18} />
                  </span>
                </span>
              </div>
              {s.petals && <div className="mt-0.5 text-xs text-ink-faint">{s.petals} petals · count can vary</div>}
            </div>
          ))}
        </div>

        <h2 className="mb-3 mt-10 font-display text-xl">In the sidebar</h2>
        <p className="mb-2 text-sm text-ink-soft">How they read at real size, one per folder, as colours would cycle by default.</p>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="glass rounded-3xl p-3">
            {['School', 'English 101', 'Biology', 'Home', 'Garden', 'Life', 'Recipes', 'Trips', 'Music'].map((name, i) => (
              <div key={name} className="flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-[0.92rem]">
                <Flower hue={HUES[i]} shape={FLOWER_SHAPES[i].id} size={18} />
                {name}
              </div>
            ))}
          </div>
          <div className="glass rounded-3xl p-3" style={{ filter: 'grayscale(1)' }}>
            {['School', 'English 101', 'Biology', 'Home', 'Garden', 'Life', 'Recipes', 'Trips', 'Music'].map((name, i) => (
              <div key={name} className="flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-[0.92rem]">
                <Flower hue={HUES[i]} shape={FLOWER_SHAPES[i].id} size={18} />
                {name}
              </div>
            ))}
            <div className="px-2.5 pt-1 text-xs text-ink-faint">Greyscale: is each one still different?</div>
          </div>
        </div>

        <h2 className="mb-3 mt-10 font-display text-xl">Petal count (an idea to keep in mind)</h2>
        <p className="mb-2 text-sm text-ink-soft">Shapes made of repeated petals can show a number at a glance: more petals for more important or urgent.</p>
        <div className="glass rounded-3xl p-4">
          {(['blossom', 'daisy', 'lily', 'cosmos', 'pinwheel', 'sunflower'] as FlowerShape[]).map((id, r) => (
            <div key={id} className="flex items-center gap-3 py-1">
              <span className="w-24 text-sm text-ink-soft">{FLOWER_SHAPES.find((s) => s.id === id)!.label}</span>
              {[3, 4, 5, 6, 8, 10, 12].map((n) => (
                <span key={n} className="flex flex-col items-center">
                  <Flower hue={HUES[(r * 2) % HUES.length]} shape={id} petals={n} size={40} />
                  <span className="text-[0.65rem] text-ink-faint">{n}</span>
                </span>
              ))}
            </div>
          ))}
        </div>

        <h2 className="mb-3 mt-10 font-display text-xl">One shape, many colours</h2>
        <div className="glass flex flex-wrap items-center gap-3 rounded-3xl p-4">
          {HUES.map((h) => (
            <Flower key={h} hue={h} shape="rose" size={40} />
          ))}
        </div>
      </div>
    </div>
  )
}

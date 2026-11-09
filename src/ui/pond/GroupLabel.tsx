import { tint } from '../../core/color'
import type { Folder } from '../../core/types'
import { openCompose, type ComposePreset } from '../NewTask'
import { Flower } from '../Flower'
import { IconPerson } from '../icons'

export interface PondLabel {
  key: string
  label: string
  x: number
  y: number
  hue?: number
  path?: { id: string; name: string }[]
}

/**
 * A group's name in the pond: in its colour, with the groups above it as small links, its flower, a + for a new subgroup or item, and a
 * hint while something is held over it. The name is a handle: dragging it carries the whole group.
 */
export function GroupLabel({
  l,
  group,
  hot,
  folders,
  add,
  onDrag,
  onStepTo,
  onNewSubgroup,
}: {
  l: PondLabel
  group: string
  hot: string | null
  folders: Folder[]
  /** What a new item from the + would start with (null: no + for this group). */
  add: ComposePreset | null
  onDrag: (e: React.PointerEvent, key: string) => void
  onStepTo: (id: string) => void
  onNewSubgroup: (parentId: string) => void
}) {
  return (
    <div
      data-ui
      onPointerDown={(e) => onDrag(e, l.key)}
      title={group === 'folder' ? 'Tap to show just this group (tap again to step back up); drag to move it, or onto another group to put it inside' : 'Drag to move this whole group'}
      style={{ color: l.hue === undefined ? 'var(--color-lilac-700)' : `${tint(l.hue, 50, 36)}` }}
      className={`pop-in -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none select-none whitespace-nowrap relative rounded-full px-3.5 py-1 font-display font-bold italic text-3xl transition-[background-color,box-shadow,opacity,text-shadow] duration-300 hover:bg-white/60 hover:shadow-sm ${
        hot === l.key ? 'bg-white/80 opacity-100 shadow-[0_0_22px_6px_rgba(167,139,250,0.55)] [text-shadow:0_0_1px_currentColor,0_0_10px_rgba(255,255,255,0.9)]' : 'opacity-90'
      }`}
    >
      {l.path && l.path.length > 1 ? (
        <>
          {/* the groups above, as small underlined links on a line of their own over the name; each moves up to that level */}
          <span className="block text-center text-[0.42em] font-normal leading-tight not-italic">
            {l.path.slice(0, -1).map((c, i) => (
              <span key={c.id}>
                {i > 0 && (
                  <span className="mx-1 opacity-60" aria-hidden>
                    ›
                  </span>
                )}
                <button onPointerDown={(e) => e.stopPropagation()} onClick={() => onStepTo(c.id)} className="underline decoration-1 underline-offset-[3px] opacity-70 transition hover:opacity-100">
                  {c.name}
                </button>
              </span>
            ))}
          </span>
          <span>
            {(() => {
            const f = folders.find((x) => x.id === l.key)
            return f ? (
              <span className="mr-1.5 inline-block -translate-y-0.5 align-middle">
                <Flower hue={f.hue} shape={f.shape} size={26} />
              </span>
            ) : null
          })()}
            {l.path[l.path.length - 1].name}
          </span>
        </>
      ) : (
        <>
          {(() => {
            const f = folders.find((x) => x.id === l.key)
            return f ? (
              <span className="mr-1.5 inline-block -translate-y-0.5 align-middle">
                <Flower hue={f.hue} shape={f.shape} size={26} />
              </span>
            ) : null
          })()}
          {l.label}
        </>
      )}
      {folders.find((f) => f.id === l.key)?.workspaceId && (
        <span title="Shared group" aria-label="Shared group" role="img" className="ml-1.5 inline-block align-middle text-[0.5em] not-italic opacity-70">
          <IconPerson size={16} />
        </span>
      )}
      {add && (
        // the + beside a group's name makes a subgroup in it (a new item is made by tapping the water near the group)
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => (group === 'folder' ? onNewSubgroup(l.key) : openCompose(null, add!))}
          aria-label={group === 'folder' ? `New subgroup in ${l.label}` : `New item in ${l.label}`}
          title={group === 'folder' ? `New subgroup in ${l.label}` : `New item in ${l.label}`}
          className="ml-2 inline-grid h-6 w-6 -translate-y-0.5 place-items-center rounded-full bg-white/65 align-middle font-sans text-base font-normal not-italic leading-none text-lilac-700 shadow-sm transition hover:scale-110 hover:bg-white"
        >
          +
        </button>
      )}
      <span
        aria-hidden
        className={`pointer-events-none absolute left-1/2 top-full -translate-x-1/2 whitespace-nowrap font-sans text-xs font-medium not-italic text-lilac-700 transition-opacity duration-300 ${hot === l.key ? 'opacity-100' : 'opacity-0'}`}
      >
        Add to group
      </span>
    </div>
  )
}

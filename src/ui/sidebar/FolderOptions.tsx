import { useEffect, useState } from 'react'
import { GRAY, tint } from '../../core/color'
import type { Folder } from '../../core/types'
import { useStore } from '../../state/store'
import { confirmDeleteFolder } from './confirmDelete'
import { FLOWER_SHAPES, Flower } from '../Flower'
import { Popover } from '../Popover'
import { IconCheck, IconPlus, IconTrash } from '../icons'


export const SWATCHES = [285, 320, 345, 20, 40, 90, 150, 175, 200, 230, 255, GRAY]

/** Everything about one folder in one place: rename it, color it, add inside it, delete it. */
export function FolderOptions({
  folder,
  open,
  onClose,
  anchor,
  onAdd,
}: {
  folder: Folder
  open: boolean
  onClose: () => void
  anchor: React.RefObject<HTMLElement | null>
  onAdd: (parentId: string) => void
}) {
  const renameFolder = useStore((s) => s.renameFolder)
  const updateFolder = useStore((s) => s.updateFolder)
  const deleteFolder = useStore((s) => s.deleteFolder)
  const [name, setName] = useState(folder.name)
  useEffect(() => {
    if (open) setName(folder.name)
  }, [open, folder.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Popover
      open={open}
      onClose={onClose}
      anchor={anchor}
      className="w-80 p-3.5"
      footer={
        <div className="mt-3 flex items-center border-t border-white/60 pt-2.5">
          <button
            onClick={() => {
              onClose()
              onAdd(folder.id)
            }}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm text-lilac-700 transition hover:bg-lilac-100/80"
          >
            <IconPlus size={14} /> Add inside
          </button>
          <button
            onClick={async () => {
              onClose()
              {
          const choices = await confirmDeleteFolder(folder)
          if (choices) deleteFolder(folder.id, choices)
        }
            }}
            className="ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm text-ink-faint transition hover:text-[#b04a6e]"
          >
            <IconTrash size={14} /> Delete
          </button>
        </div>
      }
    >
      <label className="block text-xs font-medium text-ink-soft">
        Name
        <input
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            renameFolder(folder.id, e.target.value) // ignored while empty
          }}
          onBlur={() => !name.trim() && setName(folder.name)}
          onKeyDown={(e) => e.key === 'Enter' && onClose()}
          className="well mt-1 w-full rounded-xl px-3 py-2 text-sm font-normal text-ink"
        />
      </label>

      {/* flower and color palettes side by side, 4 x 3 each; the hue slider sits under both */}
      <div className="mt-3.5 grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs font-medium text-ink-soft">Flower</div>
          <div role="listbox" aria-label="Flower" className="mt-1.5 grid grid-cols-4 gap-0.5">
            {FLOWER_SHAPES.map((x) => (
              <button
                key={x.id}
                role="option"
                aria-selected={folder.shape === x.id}
                aria-label={x.label}
                onClick={() => updateFolder(folder.id, { shape: x.id })}
                className="grid h-8 place-items-center rounded-lg transition hover:bg-lilac-100/60"
              >
                <span className={`grid h-[1.4rem] w-[1.4rem] place-items-center rounded-full ${folder.shape === x.id ? 'ring-2 ring-lilac-500 ring-offset-1 ring-offset-white/80' : ''}`}>
                  <Flower hue={folder.hue} shape={x.id} size={19} mono />
                </span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-ink-soft">Color</div>
          <div className="mt-1.5 grid grid-cols-4 gap-0.5">
            {SWATCHES.map((h) => (
              <button
                key={h}
                onClick={() => updateFolder(folder.id, { hue: h })}
                aria-label={h === GRAY ? 'Color gray' : `Color ${h}`}
                aria-pressed={folder.hue === h}
                className="grid h-8 place-items-center rounded-lg transition hover:bg-lilac-100/60"
              >
                <span
                  className={`grid h-[1.4rem] w-[1.4rem] place-items-center rounded-full ${folder.hue === h ? 'ring-2 ring-lilac-500 ring-offset-1 ring-offset-white/80' : ''}`}
                  style={{ background: `${tint(h, 62, 78)}` }}
                >
                  {folder.hue === h && <IconCheck size={11} />}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={360}
        value={folder.hue}
        onChange={(e) => updateFolder(folder.id, { hue: Number(e.target.value) })}
        className="soft hue mt-2"
        aria-label="Custom color"
      />

    </Popover>
  )
}

/**
 * The room a dragged folder will take. It opens (with a gentle spring) where the item would land,
 * nudging its neighbors apart. It answers hit-tests as the same folder so the target never flickers.
 */
/** Where a drop would land: a colored bar laid over the seam, which takes no room, so nothing shifts until you let go. */

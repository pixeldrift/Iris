import { useEffect, useRef, useState } from 'react'
import { childrenOf } from '../../core/folders'
import type { Folder } from '../../core/types'
import { useStore } from '../../state/store'
import { targetAt, useDnd, useDropTarget, usePointerDrag } from '../dnd'
import { askConfirm } from '../dialogs'
import { Flower } from '../Flower'
import { Popover } from '../Popover'
import { lifter } from '../lift'
import { openCompose } from '../NewTask'
import { CountBubble, GripHandle } from '../shared'
import { Tip } from '../Tip'
import { IconPencil, IconPlus, IconTrash } from '../icons'

import { Disclosure, Gap, rowBase } from './parts'
import { slotFor, useFolderSlot } from './folderSlot'
import { FolderOptions } from './FolderOptions'

export interface NodeProps {
  folder: Folder
  depth: number
  editing: string | null
  setEditing: (id: string | null) => void
  collapsed: Set<string>
  toggle: (id: string) => void
  count: (id: string) => number
  onAdd: (parent: string) => void
}

/** The count bubble doubles as the group's little menu: click or tap it. */
export function GroupMenu({ n, name, actions }: { n: number; name: string; actions: { label: string; icon: React.ReactNode; run: () => void }[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  return (
    <>
      <span ref={ref} className="ml-auto inline-flex">
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            setOpen((o) => !o)
          }}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`${name}: ${n} ${n === 1 ? 'item' : 'items'}. Open menu`}
          className="rounded-full transition hover:scale-105"
        >
          <CountBubble n={n} />
        </button>
      </span>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} align="end" className="!min-w-0 !p-1">
        <div className="flex items-center gap-0.5">
          {/* the everyday action sits under the thumb (right); delete is furthest away */}
          {[...actions].reverse().map((a) => (
            <button
              key={a.label}
              aria-label={a.label}
              title={a.label}
              onClick={() => {
                setOpen(false)
                a.run()
              }}
              className={`grid h-9 w-9 place-items-center rounded-xl text-ink-soft transition hover:bg-lilac-100/80 ${a.label === 'Delete' ? 'hover:text-[#b04a6e]' : 'hover:text-lilac-700'}`}
            >
              {a.icon}
            </button>
          ))}
        </div>
      </Popover>
    </>
  )
}

export function FolderNode(props: NodeProps) {
  const { folder, depth, editing, setEditing, collapsed, toggle, count, onAdd } = props
  const folders = useStore((s) => s.folders)
  const scope = useStore((s) => s.scope)
  const setScope = useStore((s) => s.setScope)
  const renameFolder = useStore((s) => s.renameFolder)
  const deleteFolder = useStore((s) => s.deleteFolder)
  const moveFolder = useStore((s) => s.moveFolder)
  const kids = childrenOf(folders, folder.id)
  const isOpen = !collapsed.has(folder.id)
  const active = scope.type === 'folder' && scope.id === folder.id
  const rowRef = useRef<HTMLDivElement>(null)
  const flowerRef = useRef<HTMLSpanElement>(null)
  const [options, setOptions] = useState(false)
  const { over, active: dragging, props: dropProps } = useDropTarget(`folder:${folder.id}`)
  const dragPayload = useDnd((s) => s.drag?.payload)
  const isSelfDrag = dragPayload?.type === 'folder' && dragPayload.id === folder.id
  const slotHere = useFolderSlot((st) => (st.slot?.kind === 'slot' && st.slot.afterId === folder.id ? st.slot : null))
  const dragIsTask = dragPayload?.type === 'task'
  const intoMe = useFolderSlot((st) => st.slot?.kind === 'into' && st.slot.parentId === folder.id)
  // the group a drop would land inside, so "last child" and "top level" look different while you are still deciding
  const parentMe = useFolderSlot((st) => st.slot?.kind === 'slot' && st.slot.parentId === folder.id)

  const track = useRef({ x: 0, y: 0, dx: 0, raf: 0 })
  const refresh = () => {
    const { x, y, dx } = track.current
    const next = targetAt(x, y) === 'froot' ? null : slotFor(useStore.getState().folders, folder.id, depth, lifter.centerY() ?? y, dx, useFolderSlot.getState().slot)
    const cur = useFolderSlot.getState().slot
    const same = cur && next && cur.kind === next.kind && cur.afterId === next.afterId && cur.depth === next.depth && cur.parentId === next.parentId && cur.beforeId === next.beforeId
    if (!same && cur !== next) useFolderSlot.setState({ slot: next })
    // the carried row never slides sideways: the finger alone says what a drop would do, and a symbol says which way it goes
    lifter.hint(!next ? null : next.kind === 'into' || next.depth > depth ? 'in' : next.depth < depth ? 'out' : null)
  }

  const onPointerDown = usePointerDrag({
    payload: { type: 'folder', id: folder.id },
    label: folder.name,
    touchNeedsHandle: true,
    lift: () => rowRef.current,
    liftOpaque: true,
    lockX: true,
    resolve: (x, y) => {
      const t = targetAt(x, y)
      if (t === 'froot') return t
      const list = document.querySelector('[data-folder-list]')?.getBoundingClientRect()
      return list && x <= list.right && y >= list.top - 30 && y <= list.bottom + 30 ? 'slot' : null
    },
    onStart: () => {
      // A finger resting on the screen sends no more moves, but the rows keep gliding under it as the
      // gap opens and closes: keep re-reading the slot every frame so what lights up is what is under you.
      const tick = () => {
        refresh()
        track.current.raf = requestAnimationFrame(tick)
      }
      track.current.raf = requestAnimationFrame(tick)
    },
    onMove: (x, y, dx) => {
      track.current.x = x
      track.current.y = y
      track.current.dx = dx
      refresh()
    },
    onEnd: ({ target }) => {
      cancelAnimationFrame(track.current.raf)
      refresh()
      const slot = useFolderSlot.getState().slot
      useFolderSlot.setState({ slot: null })
      if (target === 'froot') return moveFolder(folder.id, null)
      if (target !== 'slot' || !slot) return
      const sibs = childrenOf(folders, folder.parentId)
      const next = sibs[sibs.findIndex((f) => f.id === folder.id) + 1]?.id ?? null
      if (slot.kind === 'slot' && slot.parentId === folder.parentId && slot.beforeId === next) return
      moveFolder(folder.id, slot.parentId, slot.beforeId)
    },
  })

  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (editing === folder.id) inputRef.current?.select()
  }, [editing, folder.id])

  const actions = [
    { label: 'Add', icon: <IconPlus size={14} />, run: () => openCompose(null, { folderIds: [folder.id] }) },
    { label: 'Rename', icon: <IconPencil size={14} />, run: () => (window.matchMedia('(hover: hover)').matches ? setEditing(folder.id) : setOptions(true)) },
    {
      label: 'Delete',
      icon: <IconTrash size={14} />,
      run: async () => {
        if (await askConfirm({ title: `Delete “${folder.name}”?`, message: 'Groups inside move up a level. Items just lose this tag.', confirmLabel: 'Delete', danger: true })) deleteFolder(folder.id)
      },
    },
  ]

  return (
    <div className="rise-in">
      <div
        ref={rowRef}
        data-folder-row={folder.id}
        data-depth={depth}
        data-lift-id={`folder:${folder.id}`}
        data-flip={folder.id}
        {...dropProps}
        onPointerDown={(e) => editing !== folder.id && onPointerDown(e)}
        onClick={() => setScope(active ? { type: 'all' } : { type: 'folder', id: folder.id })}
        onDoubleClick={() => (window.matchMedia('(hover: hover)').matches ? setEditing(folder.id) : setOptions(true))}
        className={`${rowBase} cursor-pointer ${active ? 'bg-white/70 font-medium text-lilac-700' : 'hover:bg-white/45'} ${
          (over && dragIsTask && !isSelfDrag) || intoMe ? 'scale-[1.02] bg-lilac-200/80 ring-2 ring-lilac-400/60' : parentMe ? 'bg-lilac-100/60 ring-1 ring-lilac-300/70' : ''
        } ${isSelfDrag ? 'opacity-40' : ''} ${dragging && !over ? 'ring-1 ring-lilac-300/40' : ''}`}
        // a child's box is shorter, not just its text pushed over: it keeps its right edge and starts further in
        style={{ marginLeft: `${depth * 0.95}rem`, width: `calc(100% - ${depth * 0.95}rem)` }}
      >
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            toggle(folder.id)
          }}
          className={`grid h-5 w-5 shrink-0 place-items-center rounded-md text-ink-faint transition hover:bg-white/60 ${kids.length ? '' : 'invisible'}`}
          aria-label={isOpen ? 'Collapse' : 'Expand'}
        >
          <Disclosure open={isOpen} size={14} />
        </button>
        <span ref={flowerRef} className="inline-flex shrink-0">
          <Tip label="Group options">
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                setOptions((o) => !o)
              }}
              aria-haspopup="dialog"
              aria-expanded={options}
              className="grid h-6 w-6 place-items-center rounded-full transition hover:scale-110 hover:bg-white/60"
            >
              <Flower hue={folder.hue} shape={folder.shape} size={18} />
            </button>
          </Tip>
        </span>
        <FolderOptions folder={folder} open={options} onClose={() => setOptions(false)} anchor={flowerRef} onAdd={onAdd} />
        {editing === folder.id ? (
          <input
            ref={inputRef}
            autoFocus
            defaultValue={folder.name}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              renameFolder(folder.id, e.target.value)
              setEditing(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur()
            }}
            className="well min-w-0 flex-1 rounded-lg px-2 py-0.5"
          />
        ) : (
          <span
            className="truncate"
            onClick={(e) => {
              // already filtered to this group, with a mouse: the name is the thing to edit
              if (active && window.matchMedia('(hover: hover)').matches) {
                e.stopPropagation()
                setEditing(folder.id)
              }
            }}
          >
            {folder.name}
          </span>
        )}
        <GroupMenu n={count(folder.id)} name={folder.name} actions={actions} />
        <GripHandle label="Drag to move or nest" onPointerDown={(e, handle) => editing !== folder.id && onPointerDown(e, handle)} />
      </div>
      <Gap open={slotHere !== null} indent={slotHere?.depth ?? 0} line />
      {isOpen && kids.map((k) => <FolderNode key={k.id} {...props} folder={k} depth={depth + 1} />)}
    </div>
  )
}


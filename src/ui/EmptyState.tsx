import { useStore } from '../state/store'

/**
 * What a view says when it has nothing to show: one voice for every view. When a filter or a search is what is hiding things, it
 * says so and offers the way out (show everything); otherwise it says the view's own plain sentence.
 */
export function EmptyState({ children, compact = false }: { children: React.ReactNode; compact?: boolean }) {
  const filtered = useStore((s) => s.scope.type !== 'all' || s.search.trim() !== '')
  const setScope = useStore((s) => s.setScope)
  const setSearch = useStore((s) => s.setSearch)
  return (
    <div role="status" className={`text-center ${compact ? 'py-8' : 'py-16'}`}>
      <p className="font-display text-lg italic text-ink-faint">{filtered ? 'Nothing matches the filter or search.' : children}</p>
      {filtered && (
        <button
          type="button"
          onClick={() => {
            setScope({ type: 'all' })
            setSearch('')
          }}
          className="mt-3 whitespace-nowrap rounded-full bg-white/60 px-3.5 py-1.5 text-sm text-lilac-700 transition hover:bg-white"
        >
          Show everything
        </button>
      )}
    </div>
  )
}

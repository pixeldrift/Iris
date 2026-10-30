import type { DeleteChoices } from '../../core/folders'
import type { Folder } from '../../core/types'
import { askChoices } from '../dialogs'

/** Ask before deleting a group. Returns how to delete it, or null when cancelled. */
export async function confirmDeleteFolder(folder: Folder): Promise<DeleteChoices | null> {
  const r = await askChoices({
    title: `Delete “${folder.name}”?`,
    message: 'Groups inside move up a level. Items just lose this tag.',
    confirmLabel: 'Delete',
    danger: true,
    options: [
      { id: 'groups', label: 'Groups inside', choices: [{ id: 'keep', label: 'Keep' }, { id: 'delete', label: 'Delete' }], value: 'keep' },
      {
        id: 'items',
        label: 'Items',
        choices: [{ id: 'keep', label: 'Keep' }, { id: 'delete', label: 'Delete' }],
        value: 'keep',
        hint: 'Delete removes only items left in no other group.',
      },
    ],
  })
  return r && { groups: r.groups as DeleteChoices['groups'], items: r.items as DeleteChoices['items'] }
}

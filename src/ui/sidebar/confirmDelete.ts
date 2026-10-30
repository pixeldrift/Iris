import {
  descendantIds,
  pathLabel,
  type DeleteChoices,
} from "../../core/folders";
import type { Folder } from "../../core/types";
import { askChoices } from "../dialogs";

/** Ask before deleting a group. Returns how to delete it, or null when cancelled. */
export async function confirmDeleteFolder(
  folder: Folder,
  folders: Folder[],
): Promise<DeleteChoices | null> {
  const inside = descendantIds(folders, folder.id);
  const targets = folders
    .filter((f) => !inside.has(f.id))
    .map((f) => ({ id: f.id, label: pathLabel(folders, f.id) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const TOP = "__top";
  const items = [
    { id: "keep", label: "Keep" },
    { id: "delete", label: "Delete" },
    ...(targets.length ? [{ id: "move", label: "Move to…" }] : []),
  ];
  const r = await askChoices({
    title: `Delete “${folder.name}”?`,
    message: "Groups inside move up a level. Items just lose this tag.",
    confirmLabel: "Delete",
    danger: true,
    options: [
      {
        id: "groups",
        label: "Groups inside",
        choices: [
          { id: "keep", label: "Keep" },
          { id: "delete", label: "Delete" },
          { id: "move", label: "Move to…" },
        ],
        value: "keep",
        pick: {
          when: "move",
          id: "moveGroupsTo",
          label: "Choose a group",
          choices: [{ id: TOP, label: "Top level" }, ...targets],
        },
      },
      {
        id: "items",
        label: "Items",
        choices: items,
        value: "keep",
        hint: "Delete removes only items left in no other group.",
        pick: {
          when: "move",
          id: "moveTo",
          label: "Choose a group",
          choices: targets,
        },
      },
    ],
  });
  if (!r) return null;
  return {
    groups: r.groups as DeleteChoices["groups"],
    moveGroupsTo:
      r.groups === "move"
        ? r.moveGroupsTo === TOP
          ? null
          : (r.moveGroupsTo ?? null)
        : undefined,
    items: r.items as DeleteChoices["items"],
    moveTo: r.items === "move" ? (r.moveTo ?? null) : null,
  };
}

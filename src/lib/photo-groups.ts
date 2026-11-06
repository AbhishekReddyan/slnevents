/**
 * Items whose sizes share ONE proof photo (for example 10 to 15 Annada Patre of different sizes stacked together).
 * Quantities are still entered and stored per size; only the photo is shared.
 * To add another group, add its name here.
 */
const SHARED_PHOTO_GROUPS = ["Annada Patre"];

export function sharedPhotoGroup(groupName: string | null | undefined): string | null {
  const g = (groupName ?? "").trim().toLowerCase();
  return SHARED_PHOTO_GROUPS.find((s) => g.startsWith(s.toLowerCase())) ?? null;
}

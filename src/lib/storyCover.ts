/** Maximum cover media upload accepted by Supabase Storage (50 MiB). */
export const MAX_STORY_COVER_BYTES = 50 * 1024 * 1024;

/** The viewer's saved cover takes priority over the story's original media. */
export function resolveStoryCover(
  storyCover?: string | null,
  personalCover?: string | null,
): string | null {
  return personalCover || storyCover || null;
}

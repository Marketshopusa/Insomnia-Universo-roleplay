/** The viewer's saved cover takes priority over the story's original media. */
export function resolveStoryCover(
  storyCover?: string | null,
  personalCover?: string | null,
): string | null {
  return personalCover || storyCover || null;
}

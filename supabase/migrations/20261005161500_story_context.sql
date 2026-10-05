-- Keep the card's short description separate from the story development.
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS story_context text;

-- The previous editor saved full developments in description. Preserve them
-- before clearing the cover text on affected custom stories.
UPDATE public.stories
SET story_context = description,
    description = NULL
WHERE source = 'custom'
  AND story_context IS NULL
  AND length(description) > 220;

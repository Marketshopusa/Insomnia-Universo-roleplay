import { supabase } from "@/integrations/supabase/client";
import { generateSceneImage } from "@/lib/sceneImage";

/** A creator can upload a reference or let Kineva create a first frame from an idea. */
export async function uploadKinevaReference(
  ownerId: string,
  idea: string,
  providedImage?: File | null,
  source: "story" | "novel" = "story",
): Promise<string> {
  let image: Blob;
  let extension: string;
  if (providedImage) {
    extension = providedImage.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["png", "jpg", "jpeg", "webp"].includes(extension) ||
        providedImage.size > 10_000_000 || providedImage.size === 0) {
      throw new Error("Usa una imagen PNG, JPEG o WebP de hasta 10 MB");
    }
    image = providedImage;
  } else {
    const imageUrl = await generateSceneImage({
      source,
      sceneKey: `kineva-reference-${crypto.randomUUID()}`,
      focusText: idea.slice(0, 1800),
      storyDescription: idea.slice(0, 650),
      sceneText: idea.slice(0, 1800),
    });
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error("No se pudo recuperar la imagen creada por Kineva");
    image = await response.blob();
    extension = "png";
    if (image.size === 0 || image.size > 10_000_000) {
      throw new Error("La imagen creada supera el lÃ­mite de 10 MB");
    }
  }
  const path = `${ownerId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("kineva-references")
    .upload(path, image, { contentType: image.type || "image/png", upsert: false });
  if (error) throw error;
  return path;
}

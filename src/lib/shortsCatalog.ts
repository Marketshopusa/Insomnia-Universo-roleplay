export interface CatalogEpisode {
  status: string;
  error_message?: string | null;
  video_url?: string | null;
}

export function seriesStatus(episodes: CatalogEpisode[]) {
  if (!episodes.length) return { key: "empty", label: "Sin capítulos" };
  if (episodes.some((episode) => episode.status === "failed" || episode.error_message)) {
    return { key: "failed", label: "Falló" };
  }
  if (episodes.some((episode) => episode.status === "generating" || episode.status === "assembling")) {
    return { key: "producing", label: "En producción" };
  }
  if (episodes.every((episode) => episode.status === "ready" && episode.video_url)) {
    return { key: "ready", label: "Lista" };
  }
  return { key: "written", label: "Guion listo" };
}

export function episodeStatusLabel(episode: CatalogEpisode) {
  if (episode.status === "failed" || episode.error_message) return "Falló";
  if (episode.status === "generating" || episode.status === "assembling") return "En producción";
  if (episode.status === "ready" && episode.video_url) return "Listo";
  return "Sin video";
}

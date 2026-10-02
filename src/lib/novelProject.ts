export interface StoredNovelProject {
  title: string;
  description?: string | null;
  content?: string | null;
  outline?: string | null;
}

export interface RestoredNovel {
  title: string;
  logline: string;
  outline: string;
  characters: Array<Record<string, string>>;
  setting: { visual_style?: string; place?: string; time?: string } | null;
  chapters: Array<{ number: number; title: string; content: string; video_prompt?: string }>;
}

/** Rebuilds the studio view from the project row. Chapters live in `content`. */
export function novelFromProject(project: StoredNovelProject): RestoredNovel {
  const source = String(project.content || "");
  const matches = [...source.matchAll(/^##\s+(\d+)\.\s+(.+)$/gm)];
  const chapters = matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? source.length) : source.length;
    return {
      number: Number(match[1]),
      title: match[2].trim(),
      content: source.slice(start, end).trim(),
    };
  });
  let characters: Array<Record<string, string>> = [];
  let setting: RestoredNovel["setting"] = null;
  let outline = String(project.outline || "");
  const bible = outline.match(/<!-- BIBLE\n([\s\S]*?)\n-->/);
  if (bible) {
    try {
      const parsed = JSON.parse(bible[1]);
      characters = Array.isArray(parsed.characters) ? parsed.characters : [];
      setting = parsed.setting ?? null;
    } catch {
      characters = [];
    }
    outline = outline.replace(/<!-- BIBLE[\s\S]*?-->/, "").trim();
  }
  return {
    title: project.title,
    logline: project.description || "",
    outline,
    characters,
    setting,
    chapters,
  };
}

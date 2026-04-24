import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, Search, X, Tag } from "lucide-react";

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface CategoryTagsProps {
  categories: Category[];
  selectedCategories: string[];
  onCategoryToggle: (categoryId: string) => void;
}

export const CategoryTags = ({
  categories,
  selectedCategories,
  onCategoryToggle,
}: CategoryTagsProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () =>
      categories.filter((c) =>
        c.name.toLowerCase().includes(query.trim().toLowerCase())
      ),
    [categories, query]
  );

  const clearAll = () => {
    selectedCategories.forEach((id) => onCategoryToggle(id));
  };

  return (
    <div className="rounded-none border border-border/60 bg-card/40 backdrop-blur-sm">
      {/* Header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-card/70 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 flex items-center justify-center bg-primary/15 border border-primary/30">
            <Tag className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="text-sm font-medium tracking-wide">Categorías</div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
              {selectedCategories.length > 0
                ? `${selectedCategories.length} seleccionadas`
                : `${categories.length} disponibles`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedCategories.length > 0 && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                clearAll();
              }}
              className="text-xs px-2 py-1 border border-border hover:border-destructive/50 hover:text-destructive transition-colors"
            >
              Limpiar
            </span>
          )}
          <ChevronDown
            className={cn(
              "w-4 h-4 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
          />
        </div>
      </button>

      {/* Body */}
      {open && (
        <div className="border-t border-border/60 p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar categoría..."
              className="w-full bg-background/60 border border-border pl-9 pr-9 py-2 text-sm focus:outline-none focus:border-primary/60"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1.5 max-h-72 overflow-y-auto pr-1">
            {filtered.map((category) => {
              const active = selectedCategories.includes(category.id);
              return (
                <button
                  key={category.id}
                  onClick={() => onCategoryToggle(category.id)}
                  className={cn(
                    "px-2.5 py-1.5 text-xs font-medium border transition-all text-left truncate",
                    active
                      ? "bg-primary/20 border-primary text-foreground shadow-[inset_0_-2px_0_hsl(var(--primary))]"
                      : "bg-background/40 border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  )}
                >
                  {category.name}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="col-span-full text-center text-xs text-muted-foreground py-6">
                Sin resultados
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
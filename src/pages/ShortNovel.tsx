import { Link, useParams } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Loader2 } from "lucide-react";
import { useNovelProjects } from "@/hooks/useNovelProjects";
import { novelFromProject } from "@/lib/novelProject";

const ShortNovel = () => {
  const { projectId = "" } = useParams();
  const { data: projects, isLoading } = useNovelProjects();
  const project = projects?.find((item) => item.id === projectId);
  const novel = project ? novelFromProject(project) : null;

  return (
    <MainLayout>
      <div className="container mx-auto max-w-3xl px-4 py-6">
        <Link to="/shorts" className="text-xs uppercase tracking-[0.2em] text-accent">Volver a las series</Link>
        {isLoading ? (
          <div className="flex h-[40vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !project || !novel ? (
          <div className="py-16 text-center">
            <p className="font-display text-2xl">Esta novela no está en tu cuenta</p>
          </div>
        ) : (
          <>
            <p className="mt-4 text-[11px] uppercase tracking-[0.3em] text-accent">Novela</p>
            <h1 className="mt-1 font-display text-3xl md:text-4xl">{novel.title}</h1>
            {novel.logline && <p className="mt-3 text-sm text-muted-foreground">{novel.logline}</p>}
            {novel.chapters.length === 0 ? (
              <div className="mt-8 border border-border p-6">
                <p className="font-display text-xl">Esta portada no guardó los capítulos</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  El Estudio anotó el número de capítulos, pero el texto no quedó escrito. Ábrela en el Estudio y genera el proyecto otra vez.
                </p>
                <Link to={"/studio?project=" + project.id} className="mt-4 inline-block text-xs uppercase tracking-[0.16em] text-accent">
                  Escribirla en el Estudio
                </Link>
              </div>
            ) : (
              <div className="mt-8 space-y-6">
                {novel.chapters.map((chapter) => (
                  <article key={chapter.number} className="border border-border p-5">
                    <p className="text-[11px] uppercase tracking-[0.25em] text-accent">
                      Capítulo {String(chapter.number).padStart(2, "0")}
                    </p>
                    <h2 className="mt-1 font-display text-2xl">{chapter.title}</h2>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{chapter.content}</p>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
};

export default ShortNovel;

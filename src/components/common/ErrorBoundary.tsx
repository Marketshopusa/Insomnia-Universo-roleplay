import React, { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an unhandled error:", error, errorInfo);
    const msg = error?.message || "";
    const isChunkError =
      msg.includes("dynamically imported module") ||
      msg.includes("ChunkLoadError") ||
      msg.includes("Importing a module script failed") ||
      msg.includes("Failed to fetch dynamically") ||
      msg.includes("Failed to fetch");

    if (isChunkError && !sessionStorage.getItem("boundary_reload_done")) {
      sessionStorage.setItem("boundary_reload_done", "true");
      window.location.reload();
    }
  }

  private handleReload = () => {
    sessionStorage.removeItem("boundary_reload_done");
    sessionStorage.removeItem("chunk_retry_pending");
    try {
      if (typeof window !== "undefined" && "caches" in window) {
        caches.keys().then((names) => names.forEach((n) => caches.delete(n))).catch(() => {});
      }
    } catch {}
    window.location.href = window.location.pathname + (window.location.search ? window.location.search + "&" : "?") + "reload=" + Date.now();
  };

  private handleReset = () => {
    sessionStorage.removeItem("boundary_reload_done");
    sessionStorage.removeItem("chunk_retry_pending");
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4 text-foreground">
          <div className="max-w-md w-full p-8 rounded-xl border border-border/80 bg-card/90 shadow-2xl text-center space-y-5">
            <div className="w-14 h-14 rounded-full bg-destructive/15 text-destructive flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h1 className="font-display text-2xl font-bold tracking-tight">Algo no cargó correctamente</h1>
              <p className="text-sm text-muted-foreground">
                Ocurrió un problema temporal al renderizar la vista. Puedes reintentar o recargar la página.
              </p>
            </div>
            {this.state.error && (
              <details className="text-left text-xs bg-muted/60 p-3 rounded-lg border border-border/70 overflow-hidden">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-mono select-none">
                  Ver detalle técnico
                </summary>
                <div className="mt-2 text-destructive font-mono text-[11px] whitespace-pre-wrap break-all max-h-36 overflow-y-auto">
                  {this.state.error.message || String(this.state.error)}
                </div>
              </details>
            )}
            <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
              <Button onClick={this.handleReset} variant="outline" className="gap-2">
                Reintentar
              </Button>
              <Button onClick={this.handleReload} className="gap-2 bg-primary hover:bg-primary/90">
                <RefreshCw className="w-4 h-4" />
                Recargar página
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

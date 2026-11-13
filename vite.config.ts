import { defineConfig, loadEnv } from "vite";
import { supabaseUrl } from "./api/_config.mjs";
import { assertAuthProject } from "./src/lib/authProject.mjs";
import react from "@vitejs/plugin-react-swc";
import path from "path";

function localVercelApiPlugin() {
  return {
    name: "local-vercel-api",
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const url = req.url?.split("?")[0];
        if (url !== "/api/ai" && url !== "/api/illustrate" && url !== "/api/speech") {
          return next();
        }
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          const rawBody = Buffer.concat(chunks).toString("utf8");
          try {
            req.body = rawBody ? JSON.parse(rawBody) : {};
          } catch {
            req.body = {};
          }
          res.status = (code: number) => {
            res.statusCode = code;
            return res;
          };
          res.json = (payload: unknown) => {
            if (!res.headersSent) {
              res.setHeader("Content-Type", "application/json; charset=utf-8");
            }
            res.end(JSON.stringify(payload));
            return res;
          };
          const modPath = url === "/api/illustrate"
            ? "./api/illustrate.mjs"
            : url === "/api/speech"
              ? "./api/speech.mjs"
              : "./api/ai.mjs";
          const mod = await import(`${modPath}?t=${Date.now()}`);
          await mod.default(req, res);
        } catch (err: any) {
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: "internal_error", message: err?.message || "Server error" }));
          }
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  assertAuthProject(env.VITE_SUPABASE_URL, supabaseUrl);
  return ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), localVercelApiPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  });
});

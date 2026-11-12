/** Prevent a deploy from signing in to one project and verifying tokens in another. */
export function assertAuthProject(frontendUrl, backendUrl) {
  let frontend;
  let backend;
  try { frontend = new URL(frontendUrl).origin; backend = new URL(backendUrl).origin; }
  catch { throw new Error("AUTH_PROJECT_MISSING: configura la misma URL de Supabase para la pantalla y el servidor."); }
  if (frontend !== backend) {
    throw new Error(`AUTH_PROJECT_MISMATCH: la pantalla usa ${frontend}, pero el servidor usa ${backend}.`);
  }
}

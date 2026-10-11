import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Auto-recover if a new production build was deployed and stale chunk hashes 404
window.addEventListener("vite:preloadError", (event) => {
  console.warn("Vite preload error encountered, reloading window to fetch fresh chunks:", event);
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(<App />);


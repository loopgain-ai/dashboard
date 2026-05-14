import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Bind to loopback only. Setting host:true exposes the dev server on
    // every interface, which means GHSA-67mh-4wv8-2f99 (esbuild) and
    // GHSA-4w7w-66w2-5vf9 (vite) are reachable from any malicious site the
    // developer's browser happens to visit while `npm run dev` is running.
    host: "127.0.0.1",
  },
  build: {
    target: "es2022",
    // Public sourcemaps make reverse-engineering the production bundle
    // trivial and expose any reasoning embedded in comments. Disabled
    // for production builds; re-enable per-build for local debugging if needed.
    sourcemap: false,
    outDir: "dist",
    emptyOutDir: true,
  },
});

import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

// Bug 1 fix: import.meta.dirname was added in Node 21.2.
// Development uses nodejs-20 (pinned in .replit), so we derive __dirname
// the Node 20-compatible way.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(async ({ mode }) => {
  const isProd = mode === "production";

  // REPL_ID is set only inside a Replit workspace.
  // NETLIFY is injected automatically by Netlify's build environment.
  // Neither flag is true at the same time.
  const isReplit  = process.env.REPL_ID !== undefined;
  const isNetlify = process.env.NETLIFY !== undefined;

  const plugins: PluginOption[] = [react()];

  // Bug 2 fix: runtimeErrorOverlay must never load in production builds.
  // Extra guard: also skip on Netlify — the package is a devDependency that
  // only makes sense inside a Replit workspace and the dynamic import would
  // attempt to resolve it unnecessarily on the Netlify build machine.
  if (!isProd && !isNetlify) {
    const { default: runtimeErrorOverlay } = await import(
      "@replit/vite-plugin-runtime-error-modal"
    );
    plugins.push(runtimeErrorOverlay());

    // Cartographer is strictly Replit-only.
    if (isReplit) {
      const { cartographer } = await import("@replit/vite-plugin-cartographer");
      plugins.push(cartographer());
    }
  }

  return {
    plugins,
    resolve: {
      alias: {
        "@":       path.resolve(__dirname, "client", "src"),
        "@shared": path.resolve(__dirname, "shared"),
        "@assets": path.resolve(__dirname, "attached_assets"),
      },
    },
    // Vite root is the client/ folder; all paths below are relative to the
    // project root (where this config file lives), not to client/.
    root: path.resolve(__dirname, "client"),
    build: {
      // Output directory for the compiled frontend.
      // netlify.toml  →  publish = "dist/public"  must match this exactly.
      outDir: path.resolve(__dirname, "dist/public"),
      emptyOutDir: true,
      // Raise the chunk-size warning limit. The app bundles many Radix UI
      // primitives and recharts, which produce legitimately large chunks.
      chunkSizeWarningLimit: 1000,
    },
    server: {
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
    },
  };
});

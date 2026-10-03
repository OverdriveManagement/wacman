import { defineConfig } from "tsup";
export default defineConfig({
  entry: ["src/server.ts", "src/cli/import.ts"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  noExternal: ["@wacman/core"],
  external: ["pg"],
});

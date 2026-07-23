// owner: jyoung-q

import { poeTile } from "poe-tiles-sdk/vite";
import { defineConfig } from "vite";

export default defineConfig({
	root: "tile",
	build: {
		outDir: "../dist",
		emptyOutDir: true,
		// Inline ?url image imports as data: URLs — the sandboxed iframe origin
		// is "null", so hashed asset paths don't reliably resolve.
		assetsInlineLimit: 10 * 1024 * 1024,
		rollupOptions: {
			output: {
				entryFileNames: "tile-frontend.js",
				assetFileNames: "[name][extname]",
			},
		},
	},
	plugins: [poeTile({ backendEntryPoint: "src/backend.ts" })],
});

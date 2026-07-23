// owner: jyoung-q

import { poeTile } from "poe-tiles-sdk/vite";
import { defineConfig } from "vite";

export default defineConfig({
	root: "tile",
	build: {
		outDir: "../dist",
		emptyOutDir: true,
		rollupOptions: {
			output: {
				entryFileNames: "tile-frontend.js",
				assetFileNames: "[name][extname]",
			},
		},
	},
	plugins: [poeTile({ backendEntryPoint: "src/backend.ts" })],
});

// owner: jyoung-q
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./tests",
	testMatch: "*.test.playwright.ts",
	projects: [
		{
			name: "desktop",
			use: { ...devices["Desktop Chrome"] },
			testIgnore: "**/mobile-viewport.test.playwright.ts",
		},
		{
			// Named `mobile-viewport`, not `mobile`: this is Chromium with
			// phone-shaped dimensions, NOT real WebKit. Safari-specific quirks
			// (momentum scroll, address-bar dvh/vh, focus/keyboard) need real
			// iOS Safari. The `browserName` override is required because
			// `devices["iPhone 13"]` defaults to webkit but only Chromium is
			// installed on CI / devcontainer images — mirrors the Pixel 7
			// setup in projects/benchmarks/src/web-ui/playwright.config.ts.
			name: "mobile-viewport",
			use: {
				...devices["iPhone 13"],
				browserName: "chromium",
				defaultBrowserType: "chromium",
			},
			testMatch: "**/mobile-viewport.test.playwright.ts",
		},
	],
});

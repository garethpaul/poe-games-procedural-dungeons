// owner: jyoung-q
/**
 * Test setup for happy-dom environment.
 * Preloaded before tests run (see bunfig.toml) to provide a DOM for
 * `*.test.happydom.tsx` files. Non-DOM tests (mutators, etc.) are unaffected.
 */

import { GlobalWindow } from "happy-dom";

const window = new GlobalWindow();

Object.assign(globalThis, {
	window,
	document: window.document,
	navigator: window.navigator,
	location: window.location,
	history: window.history,
	Element: window.Element,
	HTMLElement: window.HTMLElement,
	HTMLDivElement: window.HTMLDivElement,
	HTMLInputElement: window.HTMLInputElement,
	HTMLButtonElement: window.HTMLButtonElement,
	HTMLTextAreaElement: window.HTMLTextAreaElement,
	Node: window.Node,
	Event: window.Event,
	CustomEvent: window.CustomEvent,
	MouseEvent: window.MouseEvent,
	KeyboardEvent: window.KeyboardEvent,
	MutationObserver: window.MutationObserver,
	DocumentFragment: window.DocumentFragment,
	Blob: window.Blob,
	URL: window.URL,
	getComputedStyle: window.getComputedStyle.bind(window),
	requestAnimationFrame: window.requestAnimationFrame.bind(window),
	cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
});

if (typeof globalThis.sessionStorage === "undefined") {
	const storage = new Map<string, string>();
	Object.defineProperty(globalThis, "sessionStorage", {
		value: {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => storage.set(key, value),
			removeItem: (key: string) => storage.delete(key),
			clear: () => storage.clear(),
			get length() {
				return storage.size;
			},
			key: (index: number) => [...storage.keys()][index] ?? null,
		},
		writable: true,
	});
}

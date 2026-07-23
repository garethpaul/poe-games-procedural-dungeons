/**
 * Entry point — the only file that imports poe-tiles-sdk.
 */
import {
	applyNativeAppGestureOverrides,
	createPoe,
	getCurrentUserId,
	installKeyboardLayoutInset,
	PostMessageEnvironment,
	suppressLongPressMagnifier,
} from "poe-tiles-sdk/v1/client.js";
import { mountApp } from "../../ui/App";
import { tileClientConfig } from "../../client";

const environment = new PostMessageEnvironment();
const Poe = createPoe({ environment });
const store = Poe.setupStore(tileClientConfig);

// Tap-to-move and drag-to-pan on the canvas are core gameplay: keep the native
// app's long-press callout / text-selection / drag gestures out of the way.
applyNativeAppGestureOverrides();
// The seed input sits in the forge panel of a full-viewport canvas app;
// shrink #root under the iOS keyboard so nothing hides behind it.
installKeyboardLayoutInset();

const root = document.getElementById("root");
if (root) {
	void mountApp(root, store, {
		suppressLongPressMagnifier,
		getCurrentUserId: () => getCurrentUserId(store),
		poe: {
			tileEnd: async (input) => {
				const result = (await Poe.room.tileEnd(input)) as {
					outcome?: string;
					playAgain?: boolean;
				};
				return result;
			},
			haptics: {
				impact: (style) =>
					Poe.haptics.impact(
						style as "light" | "soft" | "medium" | "rigid" | "heavy",
					),
				notification: (type) =>
					Poe.haptics.notification(type as "success" | "warning" | "error"),
			},
			openProfile: (userId) => void Poe.users.openProfile({ userId }),
			pickMembers: (input) => Poe.room.pickMembers(input),
		},
	});
}

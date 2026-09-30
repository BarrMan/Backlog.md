import type { BoxInterface, ScreenInterface } from "neo-neo-bblessed";
import { box } from "neo-neo-bblessed";
import { createScreen, formatTuiTitle } from "../tui.ts";

export type BoardScreenSession = {
	screen: ScreenInterface;
	ownsScreen: boolean;
	keyBindings: Array<{ keys: string[]; handler: (...args: unknown[]) => unknown }>;
	bindKey: (keys: string[], handler: (...args: unknown[]) => unknown) => void;
	container: BoxInterface;
	boardArea: BoxInterface;
};

type EventEmitterScreen = ScreenInterface & {
	removeListener(event: string, listener: (...args: unknown[]) => void): void;
};

export function removeBoardScreenListener(
	screen: ScreenInterface,
	event: string,
	listener: (...args: unknown[]) => void,
): void {
	(screen as EventEmitterScreen).removeListener(event, listener);
}

export function createBoardScreenSession(
	providedScreen: ScreenInterface | undefined,
	preserveScreen: boolean | undefined,
	projectName: string | undefined,
): BoardScreenSession {
	const screen = providedScreen ?? createScreen({ title: formatTuiTitle("Board", projectName) });
	const keyBindings: BoardScreenSession["keyBindings"] = [];
	const container = box({ parent: screen, width: "100%", height: "100%" });
	const boardArea = box({ parent: container, top: 0, left: 0, width: "100%", height: "100%-1" });
	return {
		screen,
		ownsScreen: providedScreen === undefined || !preserveScreen,
		keyBindings,
		bindKey: (keys, handler) => {
			screen.key(keys, handler);
			keyBindings.push({ keys, handler });
		},
		container,
		boardArea,
	};
}

import type { ScreenInterface } from "neo-neo-bblessed";
import { box, textbox } from "neo-neo-bblessed";
import { formatFooterContent } from "../footer-content.ts";
import { keymapKeys } from "../keymap.ts";

export type FooterSearchOptions = {
	screen: ScreenInterface;
	content: () => string;
	query: () => string;
	onQueryChange: (query: string) => void;
	onSubmit: () => void | Promise<void>;
	onCancel: () => void | Promise<void>;
	onFocusChange?: (editing: boolean) => void;
	onHeightChange?: (height: number) => void;
};

type FooterHints = { height: number; hide(): void; show(): void; setContent(content: string): void; destroy(): void };
type FooterInput = {
	hide(): void;
	show(): void;
	focus(): void;
	readInput?(): void;
	cancel?(): void;
	setValue(value: string): void;
	getValue(): unknown;
	on(event: string, handler: () => void): void;
	key(keys: string[], handler: () => boolean): void;
	destroy(): void;
};

/** A shared full-width footer that swaps shortcuts for an in-place live search. */
export class FooterSearch {
	private readonly hints: FooterHints;
	private readonly prompt: FooterHints;
	private readonly input: FooterInput;
	private editing = false;
	private previousQuery = "";

	constructor(private readonly options: FooterSearchOptions) {
		this.hints = box({
			parent: options.screen,
			bottom: 0,
			left: 10,
			width: "100%-10",
			height: 1,
			tags: true,
			wrap: true,
		}) as unknown as FooterHints;
		this.input = textbox({
			parent: options.screen,
			bottom: 0,
			left: 0,
			width: "100%",
			height: 1,
			inputOnFocus: false,
			keys: true,
			value: "",
		}) as unknown as FooterInput;
		this.prompt = box({
			parent: options.screen,
			bottom: 0,
			left: 0,
			width: 10,
			height: 1,
			content: " / Search: ",
		}) as unknown as FooterHints;
		this.input.hide();
		this.prompt.hide();
		this.input.on("keypress", () => {
			queueMicrotask(() => {
				if (this.editing) this.change(String(this.input.getValue() ?? ""));
			});
		});
		this.input.on("submit", () => this.submit());
		this.input.key(keymapKeys("shared", "escape"), () => {
			this.cancel();
			return false;
		});
	}

	get height(): number {
		return this.editing ? 1 : typeof this.hints.height === "number" ? this.hints.height : 1;
	}

	get isEditing(): boolean {
		return this.editing;
	}

	focus(): void {
		if (this.editing) return;
		this.editing = true;
		this.previousQuery = this.options.query();
		this.input.setValue(this.previousQuery);
		this.hints.hide();
		this.prompt.show();
		this.input.show();
		this.input.focus();
		this.input.readInput?.();
		this.options.onFocusChange?.(true);
		this.resize(1);
		this.options.screen.render();
	}

	render(): void {
		if (this.editing) return;
		const content = this.options.content();
		this.hints.show();
		this.prompt.hide();
		const formatted = formatFooterContent(
			content,
			typeof this.options.screen.width === "number" ? this.options.screen.width : 80,
		);
		this.hints.height = formatted.height;
		this.hints.setContent(formatted.content);
		this.resize(formatted.height);
	}

	destroy(): void {
		this.input.destroy();
		this.prompt.destroy();
		this.hints.destroy();
	}

	private change(query: string): void {
		if (query !== this.options.query()) this.options.onQueryChange(query);
	}

	private submit(): void {
		this.change(String(this.input.getValue() ?? ""));
		this.finish();
		void this.options.onSubmit();
	}

	private cancel(): void {
		this.options.onQueryChange(this.previousQuery);
		this.finish();
		void this.options.onCancel();
	}

	private finish(): void {
		this.editing = false;
		this.input.cancel?.();
		this.input.hide();
		this.prompt.hide();
		this.options.onFocusChange?.(false);
		this.render();
	}

	private resize(height: number): void {
		this.options.onHeightChange?.(height);
	}
}

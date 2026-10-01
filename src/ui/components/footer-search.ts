import type { ScreenInterface } from "neo-neo-bblessed";
import { box, textbox } from "neo-neo-bblessed";
import { formatFooterContent } from "../footer-content.ts";

const SEARCH_PROMPT = " / ";
const SEARCH_PROMPT_WIDTH = Bun.stringWidth(SEARCH_PROMPT);

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

type FooterHints = {
	height: number;
	width: number;
	hide(): void;
	show(): void;
	setContent(content: string): void;
	destroy(): void;
};
type FooterInput = {
	left: number;
	width: number;
	hide(): void;
	show(): void;
	focus(): void;
	readInput?(): void;
	cancel?(): void;
	setValue(value: string): void;
	getValue(): unknown;
	getCursor?(): { x: number; y: number };
	setCursor?(x: number, y: number): void;
	_listener?(character: string, key: { name?: string }): void;
	on(event: string, handler: () => void): void;
	destroy(): void;
};

/** A shared full-width footer that swaps shortcuts for an in-place live search. */
export class FooterSearch {
	private readonly hints: FooterHints;
	private readonly prompt: FooterHints;
	private readonly input: FooterInput;
	private editing = false;
	private previousQuery = "";
	private editorQuery = "";

	constructor(private readonly options: FooterSearchOptions) {
		const { inputWidth, promptWidth } = this.searchLayout();
		this.hints = box({
			parent: options.screen,
			bottom: 0,
			left: 0,
			width: "100%",
			height: 1,
			tags: true,
			wrap: true,
		}) as unknown as FooterHints;
		this.input = textbox({
			parent: options.screen,
			bottom: 0,
			left: promptWidth,
			width: inputWidth,
			height: 1,
			inputOnFocus: false,
			keys: true,
			value: "",
		}) as unknown as FooterInput;
		this.installEditor();
		this.prompt = box({
			parent: options.screen,
			bottom: 0,
			left: 0,
			width: promptWidth,
			height: 1,
			content: SEARCH_PROMPT,
		}) as unknown as FooterHints;
		this.input.hide();
		this.prompt.hide();
		this.input.on("submit", () => this.submit());
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
		this.editorQuery = this.previousQuery;
		this.layoutSearch();
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
		if (this.editing) {
			this.layoutSearch();
			return;
		}
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

	restoreInput(): void {
		if (!this.editing) return;
		this.layoutSearch();
		this.input.focus();
		this.input.readInput?.();
	}

	destroy(): void {
		this.input.destroy();
		this.prompt.destroy();
		this.hints.destroy();
	}

	private change(query: string): void {
		this.editorQuery = query;
		this.options.onQueryChange(query);
	}

	private submit(): void {
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

	private searchLayout(): { inputWidth: number; promptWidth: number } {
		const screenWidth = typeof this.options.screen.width === "number" ? this.options.screen.width : 80;
		const promptWidth = Math.max(0, Math.min(SEARCH_PROMPT_WIDTH, screenWidth - 1));
		return { inputWidth: Math.max(1, screenWidth - promptWidth), promptWidth };
	}

	private layoutSearch(): void {
		const { inputWidth, promptWidth } = this.searchLayout();
		this.prompt.width = promptWidth;
		this.input.left = promptWidth;
		this.input.width = inputWidth;
	}

	/**
	 * neo-neo-bblessed's textbox only deletes from the end. Keep its display and cursor
	 * geometry, but own the mutations needed for a normal single-line editor.
	 */
	private installEditor(): void {
		const defaultListener = this.input._listener?.bind(this.input);
		if (!defaultListener) return;

		this.input._listener = (character, key) => {
			if (!this.editing) return defaultListener(character, key);
			const keyName = key?.name;
			if (keyName === "escape") {
				this.cancel();
				return;
			}
			if (keyName === "backspace" || keyName === "delete") {
				const caret = this.caretIndex();
				const start = keyName === "backspace" ? this.previousCharacter(caret) : caret;
				const end = keyName === "delete" ? this.nextCharacter(caret) : caret;
				if (start !== end) this.replace(start, end, "");
				return;
			}
			if (keyName === "enter") return defaultListener(character, key);
			const inserted = Array.from(character ?? "")
				.filter((value) => {
					const code = value.codePointAt(0) ?? 0;
					return code > 0x1f && code !== 0x7f;
				})
				.join("");
			if (inserted) return this.replace(this.caretIndex(), this.caretIndex(), inserted);
			if (character) return;
			return defaultListener(character, key);
		};
	}

	private caretIndex(): number {
		const cursor = this.input.getCursor?.() ?? { x: 0, y: 0 };
		const column = Bun.stringWidth(this.editorQuery) + Math.min(0, cursor.x);
		let index = 0;
		let width = 0;
		for (const character of this.editorQuery) {
			const nextWidth = width + Bun.stringWidth(character);
			if (column < nextWidth) return index;
			width = nextWidth;
			index += character.length;
		}
		return this.editorQuery.length;
	}

	private previousCharacter(index: number): number {
		if (index === 0) return index;
		const low = this.editorQuery.charCodeAt(index - 1);
		const high = this.editorQuery.charCodeAt(index - 2);
		return index - (low >= 0xdc00 && low <= 0xdfff && high >= 0xd800 && high <= 0xdbff ? 2 : 1);
	}

	private nextCharacter(index: number): number {
		const character = this.editorQuery.codePointAt(index);
		return index + (character !== undefined && character > 0xffff ? 2 : character === undefined ? 0 : 1);
	}

	private replace(start: number, end: number, inserted: string): void {
		const value = this.editorQuery.slice(0, start) + inserted + this.editorQuery.slice(end);
		const caret = start + inserted.length;
		this.input.setValue(value);
		this.input.setCursor?.(-Bun.stringWidth(value.slice(caret)), 0);
		this.change(value);
	}
}

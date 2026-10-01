import type { ScreenInterface } from "neo-neo-bblessed";
import { box } from "neo-neo-bblessed";
import type { FilterControlId } from "../../components/filter-header.ts";
import { formatFooterContent, getBoardFooterContent } from "../../footer-content.ts";
import { formatKeymap } from "../../keymap.ts";

export type FooterRenderProps = {
	focus: "board" | "filters";
	filterFocus?: FilterControlId | null;
	isMoveActive: boolean;
	hasActiveFilters: boolean;
	hasProjects: boolean;
};

export type FooterOptions = {
	screen: ScreenInterface;
	onHeightChange?: (height: number) => void;
};

/** Board footer presentation, including temporary notices and wrapping-aware layout. */
export class Footer {
	private readonly element;
	private transientContent: string | null = null;
	private restoreTimer: ReturnType<typeof setTimeout> | null = null;
	private renderProps: Readonly<FooterRenderProps> | null = null;

	constructor(private readonly options: FooterOptions) {
		this.element = box({
			parent: options.screen,
			bottom: 0,
			left: 0,
			height: 1,
			width: "100%",
			tags: true,
			wrap: true,
			content: "",
		});
	}

	get height(): number {
		return typeof this.element.height === "number" ? this.element.height : 1;
	}

	render(props: Readonly<FooterRenderProps>): void {
		this.renderProps = { ...props };
		this.setContent(this.transientContent ?? this.contentFor(props));
	}

	showTransient(message: string, durationMs = 3000, renderImmediately = true): void {
		this.transientContent = message;
		this.clearTimer();
		if (this.renderProps) this.render(this.renderProps);
		else this.setContent(message);
		if (renderImmediately) this.options.screen.render();
		this.restoreTimer = setTimeout(() => {
			this.transientContent = null;
			this.restoreTimer = null;
			if (this.renderProps) this.render(this.renderProps);
			else this.setContent("");
			this.options.screen.render();
		}, durationMs);
	}

	destroy(): void {
		this.clearTimer();
		this.element.destroy();
	}

	private clearTimer(): void {
		if (!this.restoreTimer) return;
		clearTimeout(this.restoreTimer);
		this.restoreTimer = null;
	}

	private setContent(content: string): void {
		const width = typeof this.options.screen.width === "number" ? this.options.screen.width : 80;
		const formatted = formatFooterContent(content, width);
		this.element.height = formatted.height;
		this.element.setContent(formatted.content);
		this.options.onHeightChange?.(formatted.height);
	}

	private contentFor(props: Readonly<FooterRenderProps>): string {
		if (props.focus === "filters") {
			return props.filterFocus === "search"
				? ` {cyan-fg}[${formatKeymap("shared", "previous")}/${formatKeymap("shared", "next")}]{/} Cursor (edge=Prev/Next) | {cyan-fg}[${formatKeymap("board", "navUp")}/${formatKeymap("board", "navDown")}]{/} Back to Board | {cyan-fg}[${formatKeymap("shared", "escape")}]{/} Cancel | {gray-fg}(Live search){/}`
				: ` {cyan-fg}[${formatKeymap("shared", "activate")}]{/} Open Picker | {cyan-fg}[${formatKeymap("shared", "previous")}/${formatKeymap("shared", "next")}]{/} Prev/Next | {cyan-fg}[${formatKeymap("shared", "escape")}]{/} Back`;
		}
		if (props.isMoveActive) {
			return ` {green-fg}MOVE MODE{/} | {cyan-fg}[${formatKeymap("board", "navPrevious")}${formatKeymap("board", "navNext")}]{/} Change Column | {cyan-fg}[${formatKeymap("board", "navUp")}${formatKeymap("board", "navDown")}]{/} Reorder | {cyan-fg}[${formatKeymap("board", "moveHighlight")}]{/} Highlight | {cyan-fg}[${formatKeymap("board", "recruit")}]{/} Select | {cyan-fg}[${formatKeymap("board", "open")}]{/} Confirm | {cyan-fg}[${formatKeymap("shared", "escape")}]{/} Cancel`;
		}
		const base = getBoardFooterContent({ hasProjects: props.hasProjects });
		return props.hasActiveFilters ? `${base} | {yellow-fg}Filtered{/}` : base;
	}
}

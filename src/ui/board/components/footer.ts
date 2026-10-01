import type { ScreenInterface } from "neo-neo-bblessed";
import type { FilterControlId } from "../../components/filter-header.ts";
import { FooterSearch } from "../../components/footer-search.ts";
import { getBoardFooterContent } from "../../footer-content.ts";
import { formatKeymap } from "../../keymap.ts";

export type FooterRenderProps = {
	focus: "board" | "filters";
	filterFocus?: FilterControlId | null;
	isMoveActive: boolean;
	hasActiveFilters: boolean;
	hasProjects: boolean;
	searchQuery?: string;
};

export type FooterOptions = {
	screen: ScreenInterface;
	onHeightChange?: (height: number) => void;
	onSearchChange?: (query: string) => void;
	onSearchFocusChange?: (editing: boolean) => void;
	onSearchSubmit?: () => void;
	onSearchCancel?: () => void;
};

/** Board footer presentation, including temporary notices and the shared live search. */
export class Footer {
	private readonly footer: FooterSearch;
	private transientContent: string | null = null;
	private restoreTimer: ReturnType<typeof setTimeout> | null = null;
	private renderProps: Readonly<FooterRenderProps> | null = null;

	constructor(private readonly options: FooterOptions) {
		this.footer = new FooterSearch({
			screen: options.screen,
			content: () => this.transientContent ?? this.contentFor(this.renderProps ?? defaultProps),
			query: () => this.renderProps?.searchQuery ?? "",
			onQueryChange: (query) => options.onSearchChange?.(query),
			onSubmit: () => options.onSearchSubmit?.(),
			onCancel: () => options.onSearchCancel?.(),
			onFocusChange: (editing) => options.onSearchFocusChange?.(editing),
			onHeightChange: options.onHeightChange,
		});
	}

	get height(): number {
		return this.footer.height;
	}

	get isSearchEditing(): boolean {
		return this.footer.isEditing;
	}

	focusSearch(): void {
		this.footer.focus();
	}

	render(props: Readonly<FooterRenderProps>): void {
		this.renderProps = { ...props };
		this.footer.render();
	}

	showTransient(message: string, durationMs = 3000, renderImmediately = true): void {
		this.transientContent = message;
		this.clearTimer();
		this.footer.render();
		if (renderImmediately) this.options.screen.render();
		this.restoreTimer = setTimeout(() => {
			this.transientContent = null;
			this.restoreTimer = null;
			this.footer.render();
			this.options.screen.render();
		}, durationMs);
	}

	destroy(): void {
		this.clearTimer();
		this.footer.destroy();
	}

	private clearTimer(): void {
		if (!this.restoreTimer) return;
		clearTimeout(this.restoreTimer);
		this.restoreTimer = null;
	}

	private contentFor(props: Readonly<FooterRenderProps>): string {
		if (props.focus === "filters" && props.filterFocus !== "search")
			return ` {cyan-fg}[${formatKeymap("shared", "activate")}]{/} Open Picker | {cyan-fg}[${formatKeymap("shared", "previous")}/${formatKeymap("shared", "next")}]{/} Prev/Next | {cyan-fg}[${formatKeymap("shared", "escape")}]{/} Back`;
		if (props.isMoveActive)
			return ` {green-fg}MOVE MODE{/} | {cyan-fg}[${formatKeymap("board", "navPrevious")}${formatKeymap("board", "navNext")}]{/} Change Column | {cyan-fg}[${formatKeymap("board", "navUp")}${formatKeymap("board", "navDown")}]{/} Reorder | {cyan-fg}[${formatKeymap("board", "moveHighlight")}]{/} Highlight | {cyan-fg}[${formatKeymap("board", "recruit")}]{/} Select | {cyan-fg}[${formatKeymap("board", "open")}]{/} Confirm | {cyan-fg}[${formatKeymap("shared", "escape")}]{/} Cancel`;
		const base = getBoardFooterContent({ hasProjects: props.hasProjects });
		const query = props.searchQuery ? ` | {yellow-fg}Search: ${props.searchQuery}{/}` : "";
		return `${base}${query}${props.hasActiveFilters ? " | {yellow-fg}Filtered{/}" : ""}`;
	}
}

const defaultProps: FooterRenderProps = {
	focus: "board",
	isMoveActive: false,
	hasActiveFilters: false,
	hasProjects: false,
};

import type { BoxInterface, ScreenInterface } from "neo-neo-bblessed";
import { areLabelSelectionsEqual } from "../../../utils/label-filter.ts";
import { NO_MILESTONE_FILTER_LABEL, NO_MILESTONE_FILTER_VALUE } from "../../../utils/milestone-filter.ts";
import type { PriorityOption } from "../../../utils/priority-config.ts";
import {
	createFilterHeader,
	type FilterControlId,
	type FilterHeader,
	type FilterState,
} from "../../components/filter-header.ts";
import { openMultiSelectFilterPopup, openSingleSelectFilterPopup } from "../../components/filter-popup.ts";
import { focusTaskFilterControl } from "../../task-filter-wiring.ts";
import type { BoardSharedFilters } from "../configuration.ts";
import type { Board } from "../models/board.ts";

export type FilterBarOptions = {
	parent: BoxInterface | ScreenInterface;
	screen: ScreenInterface;
	board: Board;
	taskTypes: readonly string[];
	projects: readonly string[];
	priorityOptions: readonly PriorityOption[];
	labels: readonly string[];
	milestones: readonly string[];
	onChange?: (filters: BoardSharedFilters) => void;
	onFocus?: (focus: FilterControlId) => void;
	onExit?: (direction: "up" | "down" | "escape") => void;
};

export type FilterBarRenderProps = {
	modalOpen?: boolean;
};

/** Board filter controls, including picker lifecycle and focus transitions. */
export class FilterBar {
	private readonly header: FilterHeader;
	private modalOpen = false;
	private pickerOpen = false;
	private labels: string[];
	private milestones: string[];

	constructor(private readonly options: FilterBarOptions) {
		this.labels = [...options.labels];
		this.milestones = [...options.milestones];
		this.header = createFilterHeader({
			parent: options.parent,
			statuses: [],
			availableLabels: this.labels,
			availableMilestones: this.milestones,
			visibleFilters: [
				"type",
				...(options.projects.length > 0 ? (["project"] as const) : []),
				"priority",
				"milestone",
				"labels",
			],
			initialFilters: this.headerFilters(),
			onFilterChange: (filters) => this.applyHeaderFilters(filters),
			onFilterPickerOpen: (filterId) => {
				if (filterId !== "status") void this.openPicker(filterId);
			},
		});
		this.header.setFocusChangeHandler((focus) => {
			if (focus !== null) this.options.onFocus?.(focus);
		});
		this.header.setExitRequestHandler((direction) => this.options.onExit?.(direction));
	}

	get height(): number {
		return this.header.getHeight();
	}

	get isPickerOpen(): boolean {
		return this.pickerOpen;
	}

	get currentFocus(): FilterControlId | null {
		return this.header.getCurrentFocus();
	}

	render(props: Readonly<FilterBarRenderProps> = {}): void {
		this.modalOpen = props.modalOpen ?? false;
		this.header.setFilters(this.headerFilters());
	}

	rebuild(): void {
		this.header.rebuild();
	}

	focus(filterId: FilterControlId): void {
		focusTaskFilterControl(this.header, filterId);
	}

	open(filterId: Exclude<FilterControlId, "search" | "status">): void {
		void this.openPicker(filterId);
	}

	setSearch(query: string): void {
		this.applyFilters({ searchQuery: query });
	}

	setBorderColor(color: string): void {
		this.header.setBorderColor(color);
	}

	refreshChoices(labels: readonly string[], milestones: readonly string[]): void {
		this.labels = [...labels];
		this.milestones = [...milestones];
	}

	destroy(): void {
		this.header.destroy();
	}

	private headerFilters(): FilterState {
		const filters = this.options.board.filter.value;
		return {
			search: filters.searchQuery,
			status: filters.excludeStatus,
			taskTypes: filters.typeFilter,
			projects: filters.projectFilter,
			priority: filters.priorityFilter,
			labels: filters.labelFilter,
			milestone: filters.milestoneFilter,
		};
	}

	private applyHeaderFilters(filters: FilterState): void {
		const current = this.options.board.filter.value;
		this.applyFilters({
			searchQuery: filters.search,
			excludeStatus: filters.status,
			typeFilter: filters.taskTypes,
			projectFilter: filters.projects,
			priorityFilter: filters.priority,
			labelFilter: filters.labels,
			labelMatch: areLabelSelectionsEqual(current.labelFilter, filters.labels) ? current.labelMatch : "any",
			milestoneFilter: filters.milestone,
		});
	}

	private async openPicker(filterId: Exclude<FilterControlId, "search" | "status">): Promise<void> {
		if (this.pickerOpen || this.modalOpen || this.options.board.move) return;
		this.pickerOpen = true;
		try {
			const filters = this.options.board.filter.value;
			if (filterId === "type" || filterId === "project" || filterId === "labels") {
				const selection = await openMultiSelectFilterPopup({
					screen: this.options.screen,
					title: filterId === "type" ? "Task Type Filter" : filterId === "project" ? "Project Filter" : "Label Filter",
					items:
						filterId === "type"
							? [...this.options.taskTypes]
							: filterId === "project"
								? [...this.options.projects]
								: [...this.labels].sort((a, b) => a.localeCompare(b)),
					selectedItems:
						filterId === "type"
							? filters.typeFilter
							: filterId === "project"
								? filters.projectFilter
								: filters.labelFilter,
				});
				if (selection !== null) {
					this.applyFilters(
						filterId === "type"
							? { typeFilter: selection }
							: filterId === "project"
								? { projectFilter: selection }
								: { labelFilter: selection, labelMatch: "any" },
					);
				}
				return;
			}

			const selection = await openSingleSelectFilterPopup({
				screen: this.options.screen,
				title: filterId === "priority" ? "Priority Filter" : "Milestone Filter",
				selectedValue: filterId === "priority" ? filters.priorityFilter : filters.milestoneFilter,
				choices:
					filterId === "priority"
						? [
								{ label: "All", value: "" },
								...this.options.priorityOptions.map(({ label, value }) => ({ label, value })),
							]
						: [
								{ label: "All", value: "" },
								{ label: NO_MILESTONE_FILTER_LABEL, value: NO_MILESTONE_FILTER_VALUE },
								...this.milestones.map((value) => ({ label: value, value })),
							],
			});
			if (selection !== null)
				this.applyFilters(filterId === "priority" ? { priorityFilter: selection } : { milestoneFilter: selection });
		} finally {
			this.pickerOpen = false;
			this.focus(filterId);
			this.options.screen.render();
		}
	}

	private applyFilters(next: Partial<BoardSharedFilters>): void {
		this.options.board.setFilters(next);
		this.header.setFilters(this.headerFilters());
		this.options.onChange?.(this.options.board.filter.value);
	}
}

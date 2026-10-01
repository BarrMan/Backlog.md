type ListItem = object;

type ListWithItemRemoval = {
	items: ListItem[];
	remove(itemOrIndex: number | ListItem): unknown;
	removeItem(item: ListItem): unknown;
};

/** Repairs List#setItems object removal without changing other blessed lists. */
export function adaptListRemoval<T>(list: T): void {
	const target = list as T & ListWithItemRemoval;
	const removeAtIndex = target.remove.bind(target);
	const removeFromContainer = Object.getPrototypeOf(Object.getPrototypeOf(target)).remove as (
		this: typeof target,
		item: ListItem,
	) => unknown;

	target.remove = ((itemOrIndex: number | ListItem) => {
		if (typeof itemOrIndex === "number") return removeAtIndex(itemOrIndex);
		// removeItem removes list bookkeeping before calling this overload again.
		if (target.items.includes(itemOrIndex)) return target.removeItem(itemOrIndex);
		return removeFromContainer.call(target, itemOrIndex);
	}) as typeof target.remove;
}

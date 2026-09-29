import type React from "react";

const inputClassName =
	"flex-1 text-sm px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors";
const addButtonClassName =
	"px-4 py-2 text-sm font-medium bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors";

export function TaskDetailStringList({
	values,
	emptyMessage,
	inputName,
	placeholder,
	canAdd,
	canRemove,
	listClassName = "space-y-2",
	removeLabel,
	onChange,
	renderValue,
}: {
	values: string[];
	emptyMessage: string;
	inputName: string;
	placeholder: string;
	canAdd: boolean;
	canRemove: boolean;
	listClassName?: string;
	removeLabel: string;
	onChange: (values: string[]) => void;
	renderValue: (value: string) => React.ReactNode;
}) {
	return (
		<div className="space-y-3">
			{values.length > 0 ? (
				<ul className={listClassName}>
					{values.map((value, index) => (
						<li key={index} className="flex items-start gap-3 group">
							<span className="flex-1 min-w-0">{renderValue(value)}</span>
							{canRemove ? (
								<button
									onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}
									className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all flex-shrink-0 mt-0.5"
									title={removeLabel}
								>
									<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
									</svg>
								</button>
							) : null}
						</li>
					))}
				</ul>
			) : (
				<p className="text-sm text-gray-500 dark:text-gray-400">{emptyMessage}</p>
			)}
			{canAdd ? (
				<form
					onSubmit={(event) => {
						event.preventDefault();
						const input = event.currentTarget.elements.namedItem(inputName) as HTMLInputElement;
						const value = input.value.trim();
						if (!value || values.includes(value)) return;
						onChange([...values, value]);
						input.value = "";
					}}
					className="flex gap-2"
				>
					<input name={inputName} type="text" placeholder={placeholder} className={inputClassName} />
					<button type="submit" className={addButtonClassName}>
						Add
					</button>
				</form>
			) : null}
		</div>
	);
}

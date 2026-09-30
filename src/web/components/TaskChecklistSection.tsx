import type { AcceptanceCriterion } from "../../types";
import AcceptanceCriteriaEditor from "./AcceptanceCriteriaEditor";

export function TaskChecklistSection({
	title,
	criteria,
	mode,
	onChange,
	onToggle,
	preserveIndices = false,
	disableToggle = false,
	showIndices = false,
	emptyMessage,
}: {
	title: string;
	criteria: AcceptanceCriterion[];
	mode: "preview" | "edit" | "create";
	onChange: (criteria: AcceptanceCriterion[]) => void;
	onToggle: (index: number, checked: boolean) => void;
	preserveIndices?: boolean;
	disableToggle?: boolean;
	showIndices?: boolean;
	emptyMessage: string;
}) {
	const checkedCount = criteria.filter((criterion) => criterion.checked).length;
	return (
		<div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
			<div className="mb-3 flex items-center justify-between">
				<h3 className="text-sm font-semibold tracking-tight text-gray-900 transition-colors duration-200 dark:text-gray-100">
					{`${title} ${criteria.length ? `(${checkedCount}/${criteria.length})` : ""}`}
				</h3>
				{mode === "preview" ? (
					<div className="ml-2 text-xs text-gray-500 dark:text-gray-400">Toggle to update</div>
				) : null}
			</div>
			{mode === "preview" ? (
				<ul className="space-y-2">
					{criteria.map((criterion) => (
						<li key={criterion.index} className="flex items-start gap-2 rounded-md px-2 py-1">
							<input
								type="checkbox"
								checked={criterion.checked}
								onChange={(event) => onToggle(criterion.index, event.target.checked)}
								className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
							/>
							{showIndices ? (
								<span className="mt-0.5 w-8 shrink-0 text-right font-mono text-xs font-semibold text-gray-500 dark:text-gray-400">{`#${criterion.index}`}</span>
							) : null}
							<div className="text-sm text-gray-800 dark:text-gray-100">{criterion.text}</div>
						</li>
					))}
					{criteria.length === 0 ? <li className="text-sm text-gray-500 dark:text-gray-400">{emptyMessage}</li> : null}
				</ul>
			) : (
				<AcceptanceCriteriaEditor
					criteria={criteria}
					onChange={onChange}
					label={title}
					preserveIndices={preserveIndices}
					disableToggle={disableToggle}
				/>
			)}
		</div>
	);
}

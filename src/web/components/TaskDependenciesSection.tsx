import type { Task } from "../../types";
import DependencyInput from "./DependencyInput";

export function TaskDependenciesSection({ dependencies, availableTasks, suggestableTasks, currentTaskId, disabled, readiness, onChange }: {
	dependencies: string[];
	availableTasks: Task[];
	suggestableTasks: Task[];
	currentTaskId?: string;
	disabled: boolean;
	readiness: { isReady: boolean; message: string } | null;
	onChange: (dependencies: string[]) => void;
}) {
	return <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold tracking-tight text-gray-900 transition-colors duration-200 dark:text-gray-100">Dependencies</h3></div><DependencyInput value={dependencies} onChange={onChange} availableTasks={availableTasks} suggestableTasks={suggestableTasks} currentTaskId={currentTaskId} label="" disabled={disabled} />{readiness ? <div className={`mt-2 flex items-start gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium ${readiness.isReady ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"}`}><span aria-hidden="true">{readiness.isReady ? "✓" : "⏳"}</span><span>{readiness.message}</span></div> : null}</div>;
}

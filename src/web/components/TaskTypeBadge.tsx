import type React from "react";
import { getTaskTypePalette } from "./task-type-palette";

interface TaskTypeBadgeProps {
	type?: string;
	availableTypes?: string[];
	className?: string;
}

const TaskTypeBadge: React.FC<TaskTypeBadgeProps> = ({ type, availableTypes, className = "" }) => {
	const label = type?.trim();
	if (!label) {
		return null;
	}

	return (
		<span
			data-task-type={label}
			title={`Task type: ${label}`}
			className={`inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-4 ${getTaskTypePalette(label, availableTypes)} ${className}`}
		>
			<span className="truncate">{label}</span>
		</span>
	);
};

export default TaskTypeBadge;

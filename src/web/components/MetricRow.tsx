import type { ReactNode } from "react";

interface MetricRowProps {
	icon: ReactNode;
	label: string;
	labelClassName: string;
	count: number;
	total: number;
	barClassName: string;
}

export default function MetricRow({ icon, label, labelClassName, count, total, barClassName }: MetricRowProps) {
	const percentage = (count / total) * 100;
	return (
		<div className="flex items-center justify-between">
			<div className="flex items-center space-x-3">
				{icon}
				<span className={`px-3 py-1 rounded-circle text-sm font-medium ${labelClassName}`}>{label}</span>
			</div>
			<div className="flex items-center space-x-3">
				<div className="text-right">
					<div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{count}</div>
					<div className="text-xs text-gray-500 dark:text-gray-400">{Math.round(percentage)}%</div>
				</div>
				<div className="w-16 bg-gray-200 dark:bg-gray-700 rounded-circle h-2">
					<div className={`${barClassName} h-2 rounded-circle transition-all duration-300`} style={{ width: `${percentage}%` }} />
				</div>
			</div>
		</div>
	);
}

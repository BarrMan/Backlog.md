import type React from "react";
import type { Task } from "../../types";
import { useStatisticsData } from "../hooks/use-statistics-data";
import LoadingSpinner from "./LoadingSpinner";
import {
	ActivitySections,
	DistributionSections,
	MetricsOverview,
	ProgressOverview,
	ProjectHealth,
} from "./statistics-sections";

interface StatisticsProps {
	isLoading?: boolean;
	onEditTask?: (task: Task) => void;
	projectName?: string;
	dateFormat?: string;
}

const StatisticsLoading = ({ message }: { message: string }) => (
	<div className="flex flex-col justify-center items-center h-64 space-y-4">
		<LoadingSpinner size="lg" text="" />
		<div className="text-center">
			<p className="text-lg font-medium text-gray-900 dark:text-gray-100">{message}</p>
			<p className="text-sm text-gray-600 dark:text-gray-400 mt-1">This might take a while...</p>
		</div>
	</div>
);

const Statistics: React.FC<StatisticsProps> = ({ isLoading: externalLoading, onEditTask, projectName, dateFormat }) => {
	const { statistics, loading, error, loadingMessage } = useStatisticsData();
	if (loading || externalLoading)
		return <StatisticsLoading message={loading ? loadingMessage : "Loading statistics..."} />;
	if (error) return <StatisticsMessage title="Error loading statistics" message={error} error />;
	if (!statistics) return <StatisticsMessage message="No statistics available" />;
	return (
		<div className="max-w-7xl mx-auto p-6 space-y-8">
			<header className="text-center">
				<h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
					{projectName ? `${projectName} Statistics` : "Project Statistics"}
				</h1>
				<p className="text-gray-600 dark:text-gray-400">Overview of your project's task metrics and activity</p>
			</header>
			<MetricsOverview statistics={statistics} />
			<ProgressOverview statistics={statistics} />
			<DistributionSections statistics={statistics} />
			<ActivitySections activity={statistics.recentActivity} onEditTask={onEditTask} dateFormat={dateFormat} />
			<ProjectHealth health={statistics.projectHealth} onEditTask={onEditTask} dateFormat={dateFormat} />
		</div>
	);
};

const StatisticsMessage = ({ title, message, error = false }: { title?: string; message: string; error?: boolean }) => (
	<div className="p-8 text-center">
		{error ? (
			<div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
				<p className="text-red-600 dark:text-red-400 font-medium">{title}</p>
				<p className="text-red-500 dark:text-red-300 text-sm mt-1">{message}</p>
			</div>
		) : (
			<p className="text-gray-500 dark:text-gray-400">{message}</p>
		)}
	</div>
);

export default Statistics;

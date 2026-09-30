import { BoardLoadingSkeleton } from "./BoardLoadingSkeleton";

interface BoardContentStateProps {
	loadError?: Error | null;
	isLoading: boolean;
	loadingMessage?: string | null;
	columnCount: number;
	onRefreshData?: () => Promise<void>;
	children: React.ReactNode;
}

export function BoardContentState({
	loadError,
	isLoading,
	loadingMessage,
	columnCount,
	onRefreshData,
	children,
}: BoardContentStateProps) {
	if (loadError)
		return (
			<div
				className="rounded-lg border border-red-200 bg-red-50 px-6 py-10 text-center dark:border-red-800 dark:bg-red-900/20"
				role="alert"
			>
				<p className="font-medium text-red-700 dark:text-red-300">Failed to load tasks</p>
				<p className="mt-1 text-sm text-red-600 dark:text-red-400">{loadError.message}</p>
				{onRefreshData && (
					<button
						type="button"
						onClick={() => void onRefreshData()}
						className="mt-4 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
					>
						Retry
					</button>
				)}
			</div>
		);
	if (isLoading) return <BoardLoadingSkeleton message={loadingMessage} columnCount={columnCount} />;
	return children;
}

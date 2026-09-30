export const SideNavigationLoadingPhase = ({ className }: { className: string }) => (
	<p className={className} role="status" aria-label="Loading content">
		<span className="inline-block h-3 w-32 animate-pulse rounded bg-gray-300 dark:bg-gray-700" />
	</p>
);

export const SideNavigationCount = ({
	count,
	isLoading,
	error,
	label,
}: {
	count: number;
	isLoading: boolean;
	error?: Error | null;
	label: string;
}) => {
	if (isLoading) {
		return (
			<span
				className="inline-block h-3 w-5 animate-pulse rounded bg-gray-300 align-middle dark:bg-gray-700"
				role="status"
				aria-label={`Loading ${label} count`}
			/>
		);
	}
	return error ? (
		<span role="status" aria-label={`${label} count unavailable`}>
			—
		</span>
	) : (
		count
	);
};

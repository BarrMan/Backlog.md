export const SideNavigationLoadingPhase = ({ className }: { className: string }) => (
	<p className={className} role="status">
		<span
			className="inline-block h-3 w-32 animate-pulse rounded bg-gray-300 dark:bg-gray-700"
			aria-label="Loading content"
		/>
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
				aria-label={`Loading ${label} count`}
			/>
		);
	}
	return error ? <span aria-label={`${label} count unavailable`}>—</span> : count;
};

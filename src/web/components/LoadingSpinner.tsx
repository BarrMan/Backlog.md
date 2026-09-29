import { memo } from 'react';

interface LoadingSpinnerProps {
	size?: 'sm' | 'md' | 'lg';
	text?: string;
	className?: string;
}
const LoadingSpinner = memo(function LoadingSpinner({
								 size = 'md',
								 text = 'Loading...',
								 className = ''
							 }: LoadingSpinnerProps) {
	const sizeClasses = {
		sm: 'w-4 h-4',
		md: 'w-6 h-6',
		lg: 'w-8 h-8',
	};

	return (
		<div className={`flex items-center justify-center ${className}`}>
			<div className="flex flex-col items-center space-y-3">
				<div className={`animate-spin motion-reduce:animate-none rounded-circle border-2 border-gray-300 dark:border-gray-600 border-t-blue-600 dark:border-t-blue-400 transition-colors duration-200 ${sizeClasses[size]}`} />
				{text && (
					<p className="text-sm text-gray-600 dark:text-gray-300 font-medium transition-colors duration-200">{text}</p>
				)}
			</div>
		</div>
	);
});

export default LoadingSpinner;

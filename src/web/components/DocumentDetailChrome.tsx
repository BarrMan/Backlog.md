import type { ReactNode } from "react";
import { DocumentDetailTitle } from "./EditableDocumentContent";
import { SuccessToast } from "./SuccessToast";

interface DocumentDetailHeaderProps {
	isEditing: boolean;
	title: string;
	titleFallback: string;
	titlePlaceholder: string;
	onTitleChange: (value: string) => void;
	titleChildren?: ReactNode;
	metadata: ReactNode;
	actions: ReactNode;
}

interface DocumentDetailMetadataItem {
	icon: string;
	content: ReactNode;
	visible?: boolean;
}

export function DocumentDetailHeader({
	isEditing,
	title,
	titleFallback,
	titlePlaceholder,
	onTitleChange,
	titleChildren,
	metadata,
	actions,
}: DocumentDetailHeaderProps) {
	return (
		<div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 transition-colors duration-200">
			<div className="max-w-4xl mx-auto px-8 py-6">
				<div className="flex items-start justify-between mb-6">
					<div className="flex-1">
						<DocumentDetailTitle
							isEditing={isEditing}
							value={title}
							fallback={titleFallback}
							placeholder={titlePlaceholder}
							onChange={onTitleChange}
						>
							{titleChildren}
						</DocumentDetailTitle>
						{metadata}
					</div>
					<div className="flex items-center space-x-3 ml-6">{actions}</div>
				</div>
			</div>
		</div>
	);
}

export function DocumentDetailMetadata({ items }: { items: DocumentDetailMetadataItem[] }) {
	return (
		<div className="flex items-center space-x-6 text-sm text-gray-500 dark:text-gray-400 transition-colors duration-200">
			{items.map((item) =>
				item.visible === false ? null : (
					<div className="flex items-center space-x-2" key={item.icon}>
						<svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
						</svg>
						{item.content}
					</div>
				),
			)}
		</div>
	);
}

export function DocumentDetailStatus({ status }: { status?: string }) {
	if (!status) return null;
	const colors = {
		proposed: "bg-yellow-50 text-yellow-700 border-yellow-200",
		accepted: "bg-green-50 text-green-700 border-green-200",
		rejected: "bg-red-50 text-red-700 border-red-200",
		superseded: "bg-gray-50 text-gray-700 border-gray-200",
	} as const;
	const color = colors[status.toLowerCase() as keyof typeof colors] || "bg-gray-50 text-gray-700 border-gray-200";
	return (
		<span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${color}`}>
			{status.charAt(0).toUpperCase() + status.slice(1)}
		</span>
	);
}

export function DocumentDetailSuccessToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
	return (
		<SuccessToast
			message={message}
			onDismiss={onDismiss}
			icon={
				<svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
			}
		/>
	);
}

export function DocumentDetailSaveError({ error, onDismiss }: { error: Error | null; onDismiss: () => void }) {
	if (!error) return null;
	return (
		<div className="border-t border-red-200 bg-red-50 px-8 py-3">
			<div className="flex items-center space-x-3">
				<svg aria-hidden="true" className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z"
					/>
				</svg>
				<span className="text-sm text-red-700">Failed to save: {error.message}</span>
				<button type="button" onClick={onDismiss} className="ml-auto text-red-700 hover:text-red-900">
					<svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
		</div>
	);
}

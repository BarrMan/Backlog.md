import type { ReactNode } from "react";
import MarkdownEditor from "./MarkdownEditor";

interface EditableDocumentContentProps {
	value: string;
	onChange: (value: string) => void;
	isEditing: boolean;
	placeholder: string;
}

interface DocumentDetailTitleProps {
	isEditing: boolean;
	value: string;
	fallback: string;
	placeholder: string;
	onChange: (value: string) => void;
	children?: ReactNode;
}

export function DocumentDetailTitle({
	isEditing,
	value,
	fallback,
	placeholder,
	onChange,
	children,
}: DocumentDetailTitleProps) {
	if (!isEditing)
		return (
			<h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2 transition-colors duration-200">
				{value || fallback}
			</h1>
		);
	return (
		<div className="space-y-3 mb-2">
			<input
				type="text"
				value={value}
				onChange={(event) => onChange(event.target.value)}
				className="text-3xl font-bold text-gray-900 dark:text-gray-100 w-full bg-transparent border border-gray-300 dark:border-gray-600 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-colors duration-200"
				placeholder={placeholder}
			/>
			{children}
		</div>
	);
}

// Both document surfaces use the same editor contract; ownership of the draft remains with each route.
export default function EditableDocumentContent({
	value,
	onChange,
	isEditing,
	placeholder,
}: EditableDocumentContentProps) {
	return (
		<div className="flex-1 bg-gray-50 dark:bg-gray-800 transition-colors duration-200 flex flex-col">
			<div className="flex-1 p-8 flex flex-col min-h-0">
				<MarkdownEditor
					value={value}
					onChange={(next) => onChange(next || "")}
					isEditing={isEditing}
					placeholder={placeholder}
				/>
			</div>
		</div>
	);
}

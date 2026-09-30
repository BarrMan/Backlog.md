import MDEditor from "@uiw/react-md-editor";
import { memo } from "react";
import { useTheme } from "../contexts/ThemeContext";
import MermaidMarkdown from "./MermaidMarkdown";

interface MarkdownEditorProps {
	value: string;
	onChange?: (value: string | undefined) => void;
	isEditing: boolean;
	placeholder: string;
}

const MarkdownEditor = memo(function MarkdownEditor({ value, onChange, isEditing, placeholder }: MarkdownEditorProps) {
	const { theme } = useTheme();

	if (!isEditing) {
		return (
			<div
				className="prose prose-sm !max-w-none w-full p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
				data-color-mode={theme}
			>
				<MermaidMarkdown source={value} />
			</div>
		);
	}

	return (
		<div className="h-full w-full flex flex-col">
			<div className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
				<MDEditor
					value={value}
					onChange={onChange}
					preview="edit"
					height="100%"
					hideToolbar={false}
					data-color-mode={theme}
					textareaProps={{ placeholder, style: { fontSize: "14px", resize: "none" } }}
				/>
			</div>
		</div>
	);
});

export default MarkdownEditor;

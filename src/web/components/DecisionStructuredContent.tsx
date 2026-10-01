import MarkdownEditor from "./MarkdownEditor";

interface DecisionStructuredContentProps {
	context: string;
	decision: string;
	consequences: string;
	alternatives: string;
	onContextChange: (value: string) => void;
	onDecisionChange: (value: string) => void;
	onConsequencesChange: (value: string) => void;
	onAlternativesChange: (value: string) => void;
	isEditing: boolean;
}

export default function DecisionStructuredContent({
	context,
	decision,
	consequences,
	alternatives,
	onContextChange,
	onDecisionChange,
	onConsequencesChange,
	onAlternativesChange,
	isEditing,
}: DecisionStructuredContentProps) {
	const fields = [
		["Context", context, onContextChange],
		["Decision", decision, onDecisionChange],
		["Consequences", consequences, onConsequencesChange],
		["Alternatives", alternatives, onAlternativesChange],
	] as const;
	return (
		<div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-800 p-8 space-y-6 transition-colors duration-200">
			{fields.map(([label, value, onChange]) => (
				<section key={label} className="space-y-2">
					<h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{label}</h2>
					<MarkdownEditor
						value={value}
						onChange={(next) => onChange(next || "")}
						isEditing={isEditing}
						placeholder={`Write the decision ${label.toLowerCase()}...`}
					/>
				</section>
			))}
		</div>
	);
}

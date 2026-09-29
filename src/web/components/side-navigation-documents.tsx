import { memo } from "react";
import { NavLink } from "react-router-dom";
import type { Document } from "../../types";
import type { DocsTreeNode } from "../lib/docs-tree";
import { sanitizeUrlTitle } from "../utils/urlHelpers";

const stripIdPrefix = (id: string): string => id.replace(/^[a-zA-Z]+-/, "");

const DocumentPageIcon = () => (
	<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
		<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
	</svg>
);

const FolderIcon = () => (
	<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
		<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
	</svg>
);

const ChevronDownIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>;
const ChevronRightIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>;

export const SideNavigationDocumentLink = ({ doc, depth = 0 }: { doc: Document; depth?: number }) => (
	<NavLink
		to={`/documentation/${stripIdPrefix(doc.id)}/${sanitizeUrlTitle(doc.title)}`}
		className={({ isActive }) =>
			`flex items-center space-x-3 px-3 py-2 text-sm rounded-lg transition-colors duration-200 ${
				isActive
					? "bg-blue-50 dark:bg-blue-600/20 text-blue-600 dark:text-blue-400 font-medium"
					: "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
			}`
		}
		style={depth > 0 ? { paddingLeft: `${12 + depth * 12}px` } : undefined}
	>
		<span className="text-gray-400 dark:text-gray-500"><DocumentPageIcon /></span>
		<span className="truncate">{doc.title}</span>
	</NavLink>
);

interface FolderNodeProps {
	node: DocsTreeNode;
	depth: number;
	folderExpanded: Record<string, boolean>;
	onToggleFolder: (path: string) => void;
}

export const SideNavigationFolderNode = memo(function SideNavigationFolderNode({
	node,
	depth,
	folderExpanded,
	onToggleFolder,
}: FolderNodeProps) {
	const isExpanded = folderExpanded[node.path] ?? true;

	return (
		<div>
			<button
				onClick={() => onToggleFolder(node.path)}
				aria-label={`${node.name} folder`}
				aria-expanded={isExpanded}
				title={node.name}
				className="flex items-center px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors duration-200 w-full"
				style={{ paddingLeft: `${12 + depth * 12}px` }}
			>
				<span className="shrink-0">{isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}</span>
				<span className="text-gray-500 dark:text-gray-400 ml-1 shrink-0"><FolderIcon /></span>
				<span className="ml-2 font-medium truncate">{node.name}</span>
			</button>
			{isExpanded && (
				<div>
					{node.children.map((child) => (
						<SideNavigationFolderNode
							key={child.path}
							node={child}
							depth={depth + 1}
							folderExpanded={folderExpanded}
							onToggleFolder={onToggleFolder}
						/>
					))}
					{node.docs.map((doc) => <SideNavigationDocumentLink key={doc.id} doc={doc} depth={depth + 1} />)}
				</div>
			)}
		</div>
	);
});

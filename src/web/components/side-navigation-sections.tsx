import { memo } from "react";
import { NavLink } from "react-router-dom";
import type { Decision, Document } from "../../types";
import type { DocsTreeNode } from "../lib/docs-tree";
import { sanitizeUrlTitle } from "../utils/urlHelpers";
import { SideNavigationDocumentLink, SideNavigationFolderNode } from "./side-navigation-documents";
import { SideNavigationCount, SideNavigationLoadingPhase } from "./side-navigation-status";

type Icon = () => React.ReactNode;

const icon =
	(path: string): Icon =>
	() => (
		<svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
		</svg>
	);

const Icons = {
	Tasks: icon(
		"M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
	),
	Board: icon(
		"M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 002 2m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2",
	),
	List: icon(
		"M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
	),
	Draft: icon(
		"M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
	),
	Document: icon(
		"M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
	),
	Decision: icon(
		"M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
	),
	DecisionPage: icon("M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"),
	ChevronRight: icon("M9 5l7 7-7 7"),
	ChevronDown: icon("M19 9l-7 7-7-7"),
	Statistics: icon("M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"),
	Milestone: () => (
		<svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<circle cx="12" cy="12" r="9" strokeWidth={2} />
			<circle cx="12" cy="12" r="5" strokeWidth={2} />
			<circle cx="12" cy="12" r="1" strokeWidth={2} />
		</svg>
	),
};

const PRIMARY_NAVIGATION = [
	{ to: "/board", label: "Kanban Board", Icon: Icons.Board },
	{ to: "/tasks", label: "All Tasks", Icon: Icons.List },
	{ to: "/milestones", label: "Milestones", Icon: Icons.Milestone },
	{ to: "/drafts", label: "Drafts", Icon: Icons.Draft },
	{ to: "/statistics", label: "Statistics", Icon: Icons.Statistics },
];

const NavigationLink = ({ compact, item }: { compact: boolean; item: (typeof PRIMARY_NAVIGATION)[number] }) => {
	const { Icon } = item;
	return (
		<NavLink
			to={item.to}
			{...(compact ? { "data-tooltip-id": "sidebar-tooltip", "data-tooltip-content": item.label } : {})}
			className={({ isActive }) =>
				compact
					? `flex items-center justify-center p-3 rounded-md transition-colors duration-200 ${isActive ? "bg-blue-50 dark:bg-blue-600/20 text-blue-700 dark:text-blue-400" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"}`
					: `flex items-center px-3 py-2 rounded-lg transition-colors duration-200 ${isActive ? "bg-blue-50 dark:bg-blue-600/20 text-blue-600 dark:text-blue-400 font-medium" : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"}`
			}
		>
			{compact ? (
				<div className="w-6 h-6 flex items-center justify-center">
					<Icon />
				</div>
			) : (
				<>
					<Icon />
					<span className="ml-3 text-sm font-medium">{item.label}</span>
				</>
			)}
		</NavLink>
	);
};

export const ExpandedProjectNavigation = ({
	taskCount,
	isLoading,
	error,
}: {
	taskCount: number;
	isLoading: boolean;
	error?: Error | null;
}) => (
	<>
		<div className="px-4 py-4">
			<div className="flex items-center space-x-3 text-gray-700 dark:text-gray-300">
				<span className="text-gray-500 dark:text-gray-400">
					<Icons.Tasks />
				</span>
				<span className="text-sm font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 whitespace-nowrap">
					Tasks (<SideNavigationCount count={taskCount} isLoading={isLoading} error={error} label="task" />)
				</span>
			</div>
			{isLoading && <SideNavigationLoadingPhase className="mt-2 text-xs text-gray-500 dark:text-gray-400" />}
		</div>
		<div className="px-4 space-y-1">
			{PRIMARY_NAVIGATION.map((item) => (
				<NavigationLink key={item.to} item={item} compact={false} />
			))}
		</div>
	</>
);

interface ContentNavigationSectionsProps {
	docs: Document[];
	decisions: Decision[];
	isLoading: boolean;
	error?: Error | null;
	searchQuery: string;
	tree: DocsTreeNode[];
	ungroupedDocs: Document[];
	folderExpanded: Record<string, boolean>;
	isDocsCollapsed: boolean;
	isDecisionsCollapsed: boolean;
	onToggleDocs: () => void;
	onToggleDecisions: () => void;
	onToggleFolder: (path: string) => void;
	onCreateDocument: () => void;
}

export const ContentNavigationSections = memo(function ContentNavigationSections({
	docs,
	decisions,
	isLoading,
	error,
	searchQuery,
	tree,
	ungroupedDocs,
	folderExpanded,
	isDocsCollapsed,
	isDecisionsCollapsed,
	onToggleDocs,
	onToggleDecisions,
	onToggleFolder,
	onCreateDocument,
}: ContentNavigationSectionsProps) {
	return (
		<>
			<div className="mx-4 my-2 border-t border-gray-200 dark:border-gray-700" />
			<section className="px-4 py-4">
				<div className="flex items-center justify-between mb-4">
					<div className="flex items-center space-x-3">
						<button
							type="button"
							onClick={onToggleDocs}
							className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors duration-200"
							title={isDocsCollapsed ? "Expand documents" : "Collapse documents"}
						>
							{isDocsCollapsed ? <Icons.ChevronRight /> : <Icons.ChevronDown />}
						</button>
						<span className="text-gray-500 dark:text-gray-400">
							<Icons.Document />
						</span>
						<span className="text-sm font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 whitespace-nowrap">
							Documents (
							<SideNavigationCount count={docs.length} isLoading={isLoading} error={error} label="document" />)
						</span>
					</div>
					<button
						type="button"
						onClick={onCreateDocument}
						className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors duration-200"
						title="Create new document"
					>
						<svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
							<circle cx="12" cy="12" r="10" />
						</svg>
					</button>
				</div>
				{!isDocsCollapsed && (
					<div className="space-y-1">
						{isLoading ? (
							<SideNavigationLoadingPhase className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400" />
						) : error ? (
							<p className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Documents unavailable</p>
						) : docs.length === 0 ? (
							<p className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No documents</p>
						) : searchQuery.trim() ? (
							docs.map((doc) => <SideNavigationDocumentLink key={doc.id} doc={doc} />)
						) : (
							<>
								{tree.map((node) => (
									<SideNavigationFolderNode
										key={node.path}
										node={node}
										depth={0}
										folderExpanded={folderExpanded}
										onToggleFolder={onToggleFolder}
									/>
								))}
								{ungroupedDocs.map((doc) => (
									<SideNavigationDocumentLink key={doc.id} doc={doc} />
								))}
							</>
						)}
					</div>
				)}
			</section>
			<div className="mx-4 my-2 border-t border-gray-200 dark:border-gray-700" />
			<section className="px-4 py-4">
				<div className="flex items-center justify-between mb-4">
					<div className="flex items-center space-x-3">
						<button
							type="button"
							onClick={onToggleDecisions}
							className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors duration-200"
							title={isDecisionsCollapsed ? "Expand decisions" : "Collapse decisions"}
						>
							{isDecisionsCollapsed ? <Icons.ChevronRight /> : <Icons.ChevronDown />}
						</button>
						<span className="text-gray-500 dark:text-gray-400">
							<Icons.Decision />
						</span>
						<span className="text-sm font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 whitespace-nowrap">
							Decisions (
							<SideNavigationCount count={decisions.length} isLoading={isLoading} error={error} label="decision" />)
						</span>
					</div>
				</div>
				{!isDecisionsCollapsed && (
					<div className="space-y-1">
						{isLoading ? (
							<SideNavigationLoadingPhase className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400" />
						) : error ? (
							<p className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Decisions unavailable</p>
						) : decisions.length === 0 ? (
							<p className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No decisions</p>
						) : (
							decisions.map((decision) => (
								<NavLink
									key={decision.id}
									to={`/decisions/${decision.id.replace(/^[a-zA-Z]+-/, "")}/${sanitizeUrlTitle(decision.title)}`}
									className={({ isActive }) =>
										`flex items-center space-x-3 px-3 py-2 text-sm rounded-lg transition-colors duration-200 ${isActive ? "bg-blue-50 dark:bg-blue-600/20 text-blue-600 dark:text-blue-400 font-medium" : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"}`
									}
								>
									<span className="text-gray-400 dark:text-gray-500">
										<Icons.DecisionPage />
									</span>
									<span className="truncate">{decision.title}</span>
								</NavLink>
							))
						)}
					</div>
				)}
			</section>
		</>
	);
});

export const CollapsedProjectNavigation = ({
	pathname,
	onOpenDocuments,
	onOpenDecisions,
}: {
	pathname: string;
	onOpenDocuments: () => void;
	onOpenDecisions: () => void;
}) => (
	<div className="px-2 py-2 space-y-2">
		{PRIMARY_NAVIGATION.map((item) => (
			<NavigationLink key={item.to} item={item} compact />
		))}
		<button
			type="button"
			onClick={onOpenDocuments}
			data-tooltip-id="sidebar-tooltip"
			data-tooltip-content="Documentation"
			className={`flex items-center justify-center p-3 rounded-md transition-colors duration-200 w-full ${pathname.startsWith("/documentation") ? "bg-blue-50 dark:bg-blue-600/20 text-blue-700 dark:text-blue-400" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"}`}
		>
			<div className="w-6 h-6 flex items-center justify-center">
				<Icons.Document />
			</div>
		</button>
		<button
			type="button"
			onClick={onOpenDecisions}
			data-tooltip-id="sidebar-tooltip"
			data-tooltip-content="Decisions"
			className={`flex items-center justify-center p-3 rounded-md transition-colors duration-200 w-full ${pathname.startsWith("/decisions") ? "bg-blue-50 dark:bg-blue-600/20 text-blue-700 dark:text-blue-400" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"}`}
		>
			<div className="w-6 h-6 flex items-center justify-center">
				<Icons.Decision />
			</div>
		</button>
	</div>
);

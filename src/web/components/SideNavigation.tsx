import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Tooltip } from "react-tooltip";
import type { Decision, DecisionSearchResult, Document, DocumentSearchResult, TaskSearchResult } from "../../types";
import { useSideNavigationSearch } from "../hooks/use-side-navigation-search";
import { useSideNavigationState } from "../hooks/use-side-navigation-state";
import { buildDocsTree } from "../lib/docs-tree";
import { formatBrowserShortcut, matchesBrowserShortcut } from "../lib/keyboard-shortcuts";
import { createUrlPath, sanitizeUrlTitle } from "../utils/urlHelpers";
import ErrorBoundary from "./ErrorBoundary";
import {
	CollapsedProjectNavigation,
	ContentNavigationSections,
	ExpandedProjectNavigation,
} from "./side-navigation-sections";
import { SideNavigationFooter, SideNavigationHeader } from "./side-navigation-view";

const SearchResultIcon = ({ type }: { type: "task" | "document" | "decision" }) => {
	const [className, path] =
		type === "document"
			? [
					"text-green-500",
					"M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
				]
			: type === "decision"
				? ["text-stone-500", "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"]
				: [
						"text-purple-500",
						"M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
					];
	return (
		<span className={className}>
			<svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
			</svg>
		</span>
	);
};

interface SideNavigationProps {
	taskCount: number;
	docs: Document[];
	decisions: Decision[];
	isLoading: boolean;
	error?: Error | null;
	onRetry?: () => void;
	onRefreshData: () => Promise<void>;
}

const SideNavigation = memo(function SideNavigation({
	taskCount,
	docs,
	decisions,
	isLoading,
	error,
	onRetry,
}: SideNavigationProps) {
	const { isSearching, searchError, searchQuery, setSearchQuery, unifiedSearchResults } = useSideNavigationSearch();
	const [searchInputRef, setSearchInputRef] = useState<HTMLInputElement | null>(null);
	const state = useSideNavigationState(docs, decisions);
	const location = useLocation();
	const navigate = useNavigate();
	const { tree, ungroupedDocs } = useMemo(() => buildDocsTree(docs), [docs]);
	const toggleCollapse = useCallback(() => {
		if (state.isCollapsed) state.expandAndFocusSearch();
		else state.setIsCollapsed(true);
	}, [state]);
	const handleCreateDocument = useCallback(() => navigate("/documentation/new"), [navigate]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (matchesBrowserShortcut(event, "focusSearch")) {
				event.preventDefault();
				if (state.isCollapsed) state.expandAndFocusSearch();
				else searchInputRef?.focus();
			}
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [state, searchInputRef]);
	useEffect(() => {
		if (!state.isCollapsed && searchInputRef && state.focusSearchOnExpandRef.current) {
			state.focusSearchOnExpandRef.current = false;
			searchInputRef.focus();
		}
	}, [state, searchInputRef]);

	return (
		<ErrorBoundary>
			<div
				className={`relative bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 transition-all duration-300 flex flex-col min-h-full z-10 ${state.isCollapsed ? "w-16" : "w-80 min-w-80"}`}
			>
				<SideNavigationHeader
					isCollapsed={state.isCollapsed}
					onToggleCollapse={toggleCollapse}
					onExpandAndFocusSearch={state.expandAndFocusSearch}
					searchInputRef={setSearchInputRef}
					searchQuery={searchQuery}
					onSearchQueryChange={setSearchQuery}
					shortcut={formatBrowserShortcut("focusSearch")}
				/>
				{!state.isCollapsed && searchQuery.trim() && (
					<SearchResults
						results={unifiedSearchResults}
						isSearching={isSearching}
						error={searchError}
						pathname={location.pathname}
						search={location.search}
					/>
				)}
				<nav className="flex-1 overflow-y-auto">
					<NavigationLoadError error={error} isCollapsed={state.isCollapsed} onRetry={onRetry} />
					{state.isCollapsed ? (
						<CollapsedProjectNavigation
							pathname={location.pathname}
							onOpenDocuments={() => {
								state.setIsCollapsed(false);
								state.setIsDocsCollapsed(false);
							}}
							onOpenDecisions={() => {
								state.setIsCollapsed(false);
								state.setIsDecisionsCollapsed(false);
							}}
						/>
					) : (
						<>
							<ExpandedProjectNavigation taskCount={taskCount} isLoading={isLoading} error={error} />
							<ContentNavigationSections
								docs={docs}
								decisions={decisions}
								isLoading={isLoading}
								error={error}
								searchQuery={searchQuery}
								tree={tree}
								ungroupedDocs={ungroupedDocs}
								folderExpanded={state.folderExpanded}
								isDocsCollapsed={state.isDocsCollapsed}
								isDecisionsCollapsed={state.isDecisionsCollapsed}
								onToggleDocs={() => state.setIsDocsCollapsed(!state.isDocsCollapsed)}
								onToggleDecisions={() => state.setIsDecisionsCollapsed(!state.isDecisionsCollapsed)}
								onToggleFolder={state.toggleFolder}
								onCreateDocument={handleCreateDocument}
							/>
						</>
					)}
				</nav>
				<SideNavigationFooter isCollapsed={state.isCollapsed} version={state.version} />
				<Tooltip id="sidebar-tooltip" place="right" />
			</div>
		</ErrorBoundary>
	);
});

const NavigationLoadError = ({
	error,
	isCollapsed,
	onRetry,
}: {
	error?: Error | null;
	isCollapsed: boolean;
	onRetry?: () => void;
}) => {
	if (!error) return null;
	if (isCollapsed)
		return onRetry ? (
			<div className="px-2 py-3" role="alert">
				<button
					type="button"
					onClick={onRetry}
					className="flex w-full items-center justify-center rounded-md bg-red-50 p-3 font-bold text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
					aria-label="Failed to load navigation. Retry"
					title="Failed to load navigation. Retry"
				>
					<span aria-hidden="true">!</span>
					<span className="sr-only">Retry</span>
				</button>
			</div>
		) : null;
	return (
		<div className="px-4 py-4">
			<div className="text-center p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
				<p className="text-sm text-red-700 dark:text-red-400 mb-2">Failed to load navigation</p>
				{onRetry && (
					<button
						type="button"
						onClick={onRetry}
						className="text-xs px-3 py-1 bg-red-600 dark:bg-red-700 text-white rounded hover:bg-red-700 dark:hover:bg-red-600 transition-colors duration-200"
					>
						Retry
					</button>
				)}
			</div>
		</div>
	);
};

const SearchResults = ({
	results,
	isSearching,
	error,
	pathname,
	search,
}: {
	results: ReturnType<typeof useSideNavigationSearch>["unifiedSearchResults"];
	isSearching: boolean;
	error: string | null;
	pathname: string;
	search: string;
}) => {
	if (error)
		return (
			<div className="px-4 py-2 text-sm text-red-600 dark:text-red-400 border-b border-gray-200 dark:border-gray-700">
				{error}
			</div>
		);
	if (results.length === 0 && !isSearching)
		return (
			<div className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
				No matching results
			</div>
		);
	return (
		<div className="p-4 border-b border-gray-200 dark:border-gray-700">
			<div className="flex items-center justify-between mb-3">
				<h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Search Results</h3>
				{isSearching && <span className="text-xs text-gray-500 dark:text-gray-400">Searching…</span>}
			</div>
			<div className="space-y-1">
				{results.map((result) => {
					const item =
						result.type === "task"
							? (result as TaskSearchResult).task
							: result.type === "document"
								? (result as DocumentSearchResult).document
								: (result as DecisionSearchResult).decision;
					const to =
						result.type === "document"
							? `/documentation/${item.id.replace(/^[a-zA-Z]+-/, "")}/${sanitizeUrlTitle(item.title)}`
							: result.type === "decision"
								? `/decisions/${item.id.replace(/^[a-zA-Z]+-/, "")}/${sanitizeUrlTitle(item.title)}`
								: `${createUrlPath("/board", item.id, item.title)}${pathname === "/board" || pathname.startsWith("/board/") ? search : ""}`;
					return (
						<NavLink
							key={`${result.type}-${item.id}`}
							to={to}
							state={result.type === "task" ? { taskModalFrom: `${pathname}${search}` } : undefined}
							className="flex items-center space-x-3 px-3 py-2 text-sm rounded-lg transition-colors duration-200 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-900 dark:text-gray-100"
						>
							<SearchResultIcon type={result.type} />
							<div className="flex-1 min-w-0">
								<div className="font-medium truncate">{item.title}</div>
								<div className="text-xs text-gray-500 dark:text-gray-400 truncate">
									{result.type.charAt(0).toUpperCase() + result.type.slice(1)} • {item.id}
								</div>
							</div>
							{result.score !== null && (
								<div className="text-xs text-gray-400 dark:text-gray-500">{`${Math.round((1 - result.score) * 100)}%`}</div>
							)}
						</NavLink>
					);
				})}
			</div>
		</div>
	);
};

export default SideNavigation;

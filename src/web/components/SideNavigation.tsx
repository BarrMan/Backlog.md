import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Tooltip } from "react-tooltip";
import type { Decision, DecisionSearchResult, Document, DocumentSearchResult, TaskSearchResult } from "../../types";
import ErrorBoundary from "./ErrorBoundary";
import {
	ContentNavigationSections,
	CollapsedProjectNavigation,
	ExpandedProjectNavigation,
} from "./side-navigation-sections";
import { buildDocsTree } from "../lib/docs-tree";
import { formatBrowserShortcut, matchesBrowserShortcut } from "../lib/keyboard-shortcuts";
import { useSideNavigationSearch } from "../hooks/use-side-navigation-search";
import { createUrlPath, sanitizeUrlTitle } from "../utils/urlHelpers";
import { getWebVersion } from "../utils/version";

const SearchIcon = () => (
	<svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
		<path
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth={2}
			d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
		/>
	</svg>
);
const ChevronLeftIcon = () => (
	<svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
		<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
	</svg>
);
const ChevronRightIcon = () => (
	<svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
		<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
	</svg>
);
const SettingsIcon = () => (
	<svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
		<path
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth={2}
			d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31 2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
		/>
		<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
	</svg>
);

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
	const [isCollapsed, setIsCollapsed] = useState(() => JSON.parse(localStorage.getItem("sideNavCollapsed") ?? "false"));
	const { isSearching, searchError, searchQuery, setSearchQuery, unifiedSearchResults } = useSideNavigationSearch();
	const [searchInputRef, setSearchInputRef] = useState<HTMLInputElement | null>(null);
	const focusSearchOnExpandRef = useRef(false);
	const expandAndFocusSearch = useCallback(() => {
		focusSearchOnExpandRef.current = true;
		setIsCollapsed(false);
	}, []);
	const [isDocsCollapsed, setIsDocsCollapsed] = useState(() =>
		JSON.parse(localStorage.getItem("docsCollapsed") ?? String(docs.length > 6)),
	);
	const [folderExpanded, setFolderExpanded] = useState<Record<string, boolean>>(() =>
		JSON.parse(localStorage.getItem("docsFolderExpanded") ?? "{}"),
	);
	const [isDecisionsCollapsed, setIsDecisionsCollapsed] = useState(() =>
		JSON.parse(localStorage.getItem("decisionsCollapsed") ?? String(decisions.length > 6)),
	);
	const [version, setVersion] = useState("");
	const location = useLocation();
	const navigate = useNavigate();
	const { tree, ungroupedDocs } = useMemo(() => buildDocsTree(docs), [docs]);
	const toggleFolder = useCallback(
		(path: string) => setFolderExpanded((current) => ({ ...current, [path]: !(current[path] ?? true) })),
		[],
	);
	const toggleCollapse = useCallback(() => {
		if (isCollapsed) expandAndFocusSearch();
		else setIsCollapsed(true);
	}, [expandAndFocusSearch, isCollapsed]);
	const handleCreateDocument = useCallback(() => navigate("/documentation/new"), [navigate]);

	useEffect(() => {
		localStorage.setItem("sideNavCollapsed", JSON.stringify(isCollapsed));
	}, [isCollapsed]);
	useEffect(() => {
		getWebVersion()
			.then(setVersion)
			.catch(() => setVersion(""));
	}, []);
	useEffect(() => {
		localStorage.setItem("docsCollapsed", JSON.stringify(isDocsCollapsed));
	}, [isDocsCollapsed]);
	useEffect(() => {
		localStorage.setItem("decisionsCollapsed", JSON.stringify(isDecisionsCollapsed));
	}, [isDecisionsCollapsed]);
	useEffect(() => {
		localStorage.setItem("docsFolderExpanded", JSON.stringify(folderExpanded));
	}, [folderExpanded]);
	useEffect(() => {
		if (localStorage.getItem("docsCollapsed") === null && docs.length > 6) setIsDocsCollapsed(true);
	}, [docs.length]);
	useEffect(() => {
		if (localStorage.getItem("decisionsCollapsed") === null && decisions.length > 6) setIsDecisionsCollapsed(true);
	}, [decisions.length]);
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (matchesBrowserShortcut(event, "focusSearch")) {
				event.preventDefault();
				if (isCollapsed) expandAndFocusSearch();
				else searchInputRef?.focus();
			}
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [expandAndFocusSearch, searchInputRef, isCollapsed]);
	useEffect(() => {
		if (!isCollapsed && searchInputRef && focusSearchOnExpandRef.current) {
			focusSearchOnExpandRef.current = false;
			searchInputRef.focus();
		}
	}, [isCollapsed, searchInputRef]);

	return (
		<ErrorBoundary>
			<div
				className={`relative bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 transition-all duration-300 flex flex-col min-h-full z-10 ${isCollapsed ? "w-16" : "w-80 min-w-80"}`}
			>
				<div
					className={`${isCollapsed ? "px-2" : "px-4"} border-b border-gray-200 dark:border-gray-700 h-18 flex items-center relative`}
				>
					<button
						type="button"
						onClick={toggleCollapse}
						className="absolute -right-3 top-1/2 transform -translate-y-1/2 z-10 flex items-center justify-center w-6 h-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-circle shadow-sm hover:shadow-md text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-all duration-200"
						aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
						title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
					>
						{isCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
					</button>
					{isCollapsed ? (
						<div className="flex items-center justify-center">
							<button
								type="button"
								onClick={expandAndFocusSearch}
								className="flex items-center justify-center p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors duration-200"
								title={`Search (${formatBrowserShortcut("focusSearch")})`}
							>
								<SearchIcon />
							</button>
						</div>
					) : (
						<div className="relative flex-1">
							<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 dark:text-gray-500">
								<SearchIcon />
							</div>
							<input
								ref={setSearchInputRef}
								type="text"
								placeholder={`Search (${formatBrowserShortcut("focusSearch")})...`}
								value={searchQuery}
								onChange={(event) => setSearchQuery(event.target.value)}
								className="w-full pl-10 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 focus:border-transparent transition-colors duration-200"
							/>
							{searchQuery && (
								<button
									type="button"
									onClick={() => setSearchQuery("")}
									className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors duration-200"
								>
									×
								</button>
							)}
						</div>
					)}
				</div>
				{!isCollapsed && searchQuery.trim() && (
					<SearchResults
						results={unifiedSearchResults}
						isSearching={isSearching}
						error={searchError}
						pathname={location.pathname}
						search={location.search}
					/>
				)}
				<nav className="flex-1 overflow-y-auto">
					{error &&
						(isCollapsed ? (
							onRetry && (
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
							)
						) : (
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
						))}
					{isCollapsed ? (
						<CollapsedProjectNavigation
							pathname={location.pathname}
							onOpenDocuments={() => {
								setIsCollapsed(false);
								setIsDocsCollapsed(false);
							}}
							onOpenDecisions={() => {
								setIsCollapsed(false);
								setIsDecisionsCollapsed(false);
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
								folderExpanded={folderExpanded}
								isDocsCollapsed={isDocsCollapsed}
								isDecisionsCollapsed={isDecisionsCollapsed}
								onToggleDocs={() => setIsDocsCollapsed(!isDocsCollapsed)}
								onToggleDecisions={() => setIsDecisionsCollapsed(!isDecisionsCollapsed)}
								onToggleFolder={toggleFolder}
								onCreateDocument={handleCreateDocument}
							/>
						</>
					)}
				</nav>
				<div className={`border-t border-gray-200 dark:border-gray-700 ${isCollapsed ? "px-2 py-2" : "px-4 py-4"}`}>
					<NavLink
						to="/settings"
						{...(isCollapsed ? { "data-tooltip-id": "sidebar-tooltip", "data-tooltip-content": "Settings" } : {})}
						className={({ isActive }) =>
							isCollapsed
								? `flex items-center justify-center p-3 rounded-md transition-colors duration-200 ${isActive ? "bg-stone-50 dark:bg-stone-900/30 text-stone-700 dark:text-stone-400" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"}`
								: `flex items-center px-3 py-2 rounded-lg transition-colors duration-200 ${isActive ? "bg-blue-50 dark:bg-blue-600/20 text-blue-600 dark:text-blue-400 font-medium" : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"}`
						}
					>
						<div className={isCollapsed ? "w-6 h-6 flex items-center justify-center" : undefined}>
							<SettingsIcon />
						</div>
						{!isCollapsed && (
							<>
								<span className="ml-3 text-sm font-medium">Settings</span>
								{version && (
									<span className="ml-auto text-xs text-gray-500 dark:text-gray-400">Backlog.md - v{version}</span>
								)}
							</>
						)}
					</NavLink>
				</div>
				<Tooltip id="sidebar-tooltip" place="right" />
			</div>
		</ErrorBoundary>
	);
});

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
				{results.map((result, index) => {
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
							key={`${result.type}-${item.id}-${index}`}
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

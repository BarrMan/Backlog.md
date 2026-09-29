import { useEffect, useMemo, useState } from "react";
import type { SearchResult, SearchResultType } from "../../types";
import { apiClient } from "../lib/api";
import { parseSearchCommandQuery } from "../utils/search-command-query";

const hasTaskSearchFilters = (parsedQuery: ReturnType<typeof parseSearchCommandQuery>): boolean =>
	Boolean(
		parsedQuery.status ||
			parsedQuery.priority ||
			parsedQuery.assignee ||
			(parsedQuery.labels && parsedQuery.labels.length > 0) ||
			(parsedQuery.modifiedFiles && parsedQuery.modifiedFiles.length > 0),
	);

export const useSideNavigationSearch = () => {
	const [searchQuery, setSearchQuery] = useState("");
	const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
	const [isSearching, setIsSearching] = useState(false);
	const [searchError, setSearchError] = useState<string | null>(null);

	useEffect(() => {
		const query = searchQuery.trim();
		if (query === "") {
			setSearchResults([]);
			setSearchError(null);
			setIsSearching(false);
			return;
		}

		let cancelled = false;
		setIsSearching(true);
		setSearchError(null);
		const timeout = setTimeout(async () => {
			try {
				const parsedQuery = parseSearchCommandQuery(query);
				const types: SearchResultType[] | undefined =
					parsedQuery.types ?? (hasTaskSearchFilters(parsedQuery) ? ["task"] : undefined);
				const results = await apiClient.search({ ...parsedQuery, types, limit: 15 });
				if (!cancelled) setSearchResults(results);
			} catch (err) {
				console.error("Sidebar search failed:", err);
				if (!cancelled) {
					setSearchResults([]);
					setSearchError("Search failed");
				}
			} finally {
				if (!cancelled) setIsSearching(false);
			}
		}, 200);

		return () => {
			cancelled = true;
			clearTimeout(timeout);
		};
	}, [searchQuery]);

	const unifiedSearchResults = useMemo(() => {
		if (!searchQuery.trim()) return [];
		return [...searchResults]
			.sort((a, b) => (a.score ?? Number.POSITIVE_INFINITY) - (b.score ?? Number.POSITIVE_INFINITY))
			.slice(0, 5);
	}, [searchQuery, searchResults]);

	return { isSearching, searchError, searchQuery, setSearchQuery, unifiedSearchResults };
};

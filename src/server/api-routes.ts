/** Stable HTTP paths and headers shared by the browser client and server resources. */
export const API_ROUTES = {
	CONFIG: "/api/config",
	STATISTICS: "/api/statistics",
	STATUS: "/api/status",
	VERSION: "/api/version",
	INIT: "/api/init",
	TASKS: "/api/tasks",
	TASK: <Id extends string>(id: Id) => `/api/tasks/${id}` as const,
	LEGACY_TASK: <Id extends string>(id: Id) => `/api/task/${id}` as const,
	TASK_COMPLETE: <Id extends string>(id: Id) => `/api/tasks/${id}/complete` as const,
	TASK_DEMOTE: <Id extends string>(id: Id) => `/api/tasks/${id}/demote` as const,
	TASK_REORDER: "/api/tasks/reorder",
	TASK_MOVE: "/api/tasks/move",
	TASK_CLEANUP: "/api/tasks/cleanup",
	TASK_CLEANUP_EXECUTE: "/api/tasks/cleanup/execute",
	TASK_DUPLICATES: "/api/tasks/duplicates",
	STATUSES: "/api/statuses",
	DRAFTS: "/api/drafts",
	DRAFT_PROMOTE: <Id extends string>(id: Id) => `/api/drafts/${id}/promote` as const,
	SEARCH: "/api/search",
	DOCS: "/api/docs",
	DOC: <Id extends string>(id: Id) => `/api/docs/${id}` as const,
	LEGACY_DOC: <Id extends string>(id: Id) => `/api/doc/${id}` as const,
	DECISIONS: "/api/decisions",
	DECISION: <Id extends string>(id: Id) => `/api/decisions/${id}` as const,
	LEGACY_DECISION: <Id extends string>(id: Id) => `/api/decision/${id}` as const,
	MILESTONES: "/api/milestones",
	ARCHIVED_MILESTONES: "/api/milestones/archived",
	MILESTONE: <Id extends string>(id: Id) => `/api/milestones/${id}` as const,
	MILESTONE_ARCHIVE: <Id extends string>(id: Id) => `/api/milestones/${id}/archive` as const,
} as const;

export const PROJECT_SCOPE_HEADER = "X-Backlog-Project-Scope";

export const HTTP_METHOD = {
	GET: "GET",
	HEAD: "HEAD",
	POST: "POST",
	PUT: "PUT",
	DELETE: "DELETE",
} as const;

export const HTTP_HEADER = {
	CONTENT_TYPE: "Content-Type",
} as const;

export const MEDIA_TYPE = {
	JSON: "application/json",
} as const;

export const TASK_FRONTMATTER_FIELDS = {
	SCHEMA_VERSION: "task_schema_version",
	ID: "id",
	TITLE: "title",
	STATUS: "status",
	ASSIGNEE: "assignee",
	REPORTER: "reporter",
	CREATED_DATE: "created_date",
	UPDATED_DATE: "updated_date",
	DUE_DATE: "due_date",
	LABELS: "labels",
	MILESTONE: "milestone",
	DEPENDENCIES: "dependencies",
	REFERENCES: "references",
	DOCUMENTATION: "documentation",
	MODIFIED_FILES: "modified_files",
	PARENT_TASK_ID: "parent_task_id",
	SUBTASKS: "subtasks",
	PRIORITY: "priority",
	TYPE: "type",
	PROJECT: "project",
	ORDINAL: "ordinal",
	ON_STATUS_CHANGE: "onStatusChange",
	AGENT_CONFIGURATION: "agentConfiguration",
	DESCRIPTION: "description",
	IMPLEMENTATION_PLAN: "implementation_plan",
	IMPLEMENTATION_NOTES: "implementation_notes",
	FINAL_SUMMARY: "final_summary",
	ACCEPTANCE_CRITERIA: "acceptance_criteria",
	DEFINITION_OF_DONE: "definition_of_done",
	COMMENTS: "comments",
} as const;

export const DECISION_FRONTMATTER_FIELDS = {
	SCHEMA_VERSION: "decision_schema_version",
	ID: "id",
	TITLE: "title",
	DATE: "date",
	STATUS: "status",
	CONTEXT: "context",
	DECISION: "decision",
	CONSEQUENCES: "consequences",
	ALTERNATIVES: "alternatives",
} as const;

export const MILESTONE_FRONTMATTER_FIELDS = {
	SCHEMA_VERSION: "milestone_schema_version",
	ID: "id",
	TITLE: "title",
	DUE_DATE: "due_date",
	DESCRIPTION: "description",
} as const;

export const DOCUMENT_FRONTMATTER_FIELDS = {
	ID: "id",
	TITLE: "title",
	TYPE: "type",
	CREATED_DATE: "created_date",
	UPDATED_DATE: "updated_date",
	TAGS: "tags",
} as const;

export const CHECKLIST_FRONTMATTER_FIELDS = {
	INDEX: "index",
	TEXT: "text",
	CHECKED: "checked",
} as const;

export const COMMENT_FRONTMATTER_FIELDS = {
	INDEX: "index",
	BODY: "body",
	CREATED_DATE: "created_date",
	AUTHOR: "author",
} as const;

export const TASK_FRONTMATTER_SCHEMA_VERSION = 2;
export const DECISION_FRONTMATTER_SCHEMA_VERSION = 1;
export const MILESTONE_FRONTMATTER_SCHEMA_VERSION = 1;

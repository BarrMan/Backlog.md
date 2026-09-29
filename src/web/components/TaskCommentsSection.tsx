import type { TaskComment } from "../../types";
import MermaidMarkdown from "./MermaidMarkdown";
import StoredDate from "./StoredDate";

export function TaskCommentsSection({ comments, mode, isReadOnly, theme, dateFormat, author, body, saving, onAuthorChange, onBodyChange, onAdd }: {
	comments: TaskComment[];
	mode: "preview" | "edit" | "create";
	isReadOnly: boolean;
	theme: string;
	dateFormat?: string;
	author: string;
	body: string;
	saving: boolean;
	onAuthorChange: (value: string) => void;
	onBodyChange: (value: string) => void;
	onAdd: () => void;
}) {
	return <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
		<div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold tracking-tight text-gray-900 transition-colors duration-200 dark:text-gray-100">{`Comments${comments.length ? ` (${comments.length})` : ""}`}</h3></div>
		{comments.length ? <div className="space-y-4">{comments.map((comment) => <article key={`${comment.index}-${comment.createdDate}`} className="border-l-2 border-gray-200 pl-3 dark:border-gray-700"><div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400"><span className="font-semibold text-gray-700 dark:text-gray-200">#{comment.index}</span>{comment.author ? <span>{comment.author}</span> : null}{comment.createdDate ? <StoredDate value={comment.createdDate} dateFormat={dateFormat} /> : null}</div><div className="prose prose-sm !max-w-none wmde-markdown" data-color-mode={theme}><MermaidMarkdown source={comment.body} /></div></article>)}</div> : <div className="text-sm text-gray-500 dark:text-gray-400">No comments</div>}
		{mode === "edit" && !isReadOnly ? <div className="mt-4 space-y-2"><input type="text" value={author} onChange={(event) => onAuthorChange(event.target.value)} placeholder="Author" className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 transition-colors duration-200 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-blue-400" /><textarea value={body} onChange={(event) => onBodyChange(event.target.value)} rows={4} placeholder="Add a comment..." className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" /><div className="flex justify-end"><button type="button" onClick={onAdd} disabled={saving || body.trim().length === 0} className="rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50">{saving ? "Adding..." : "Add comment"}</button></div></div> : null}
	</div>;
}

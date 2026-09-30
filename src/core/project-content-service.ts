import { rename as moveFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFrontmatter } from "../markdown/frontmatter.ts";
import type {
	Decision,
	Document,
	DocumentCreateInput,
	DocumentType,
	DocumentUpdateInput,
	Milestone,
} from "../types/index.ts";
import { formatStoredDate } from "../utils/date.ts";
import { findDocumentById, normalizeDocumentId } from "../utils/document-id.ts";
import { getDocumentSubPathFromRelativePath, normalizeDocumentSubPath } from "../utils/document-path.ts";
import { generateNextDecisionId, generateNextDocId } from "../utils/id-generators.ts";
import { normalizeStringList } from "../utils/task-builders.ts";
import type { Core } from "./backlog.ts";

function normalizeDocumentTypeInput(type: unknown): DocumentType | undefined {
	if (type === undefined) return undefined;
	if (typeof type === "string" && ["guide", "reference", "design", "other"].includes(type)) return type as DocumentType;
	throw new Error("Document type must be one of: guide, reference, design, other.");
}

export class ProjectContentService {
	constructor(private readonly core: Core) {}

	async getDocument(documentId: string): Promise<Document | null> {
		return findDocumentById(await this.core.fs.listDocuments(), documentId);
	}

	async getDocumentContent(documentId: string): Promise<string | null> {
		const document = await this.getDocument(documentId);
		if (!document) return null;
		try {
			return await Bun.file(
				join(this.core.fs.docsDir, ...normalizeDocumentSubPath(document.path ?? `${document.id}.md`).split("/")),
			).text();
		} catch {
			return null;
		}
	}

	private async commitMilestoneMove(
		verb: "Archive" | "Rename",
		result: { sourcePath: string; targetPath: string; milestone?: Milestone },
		rollback: () => Promise<void>,
	): Promise<void> {
		const repoRoot = await this.core.git.stageFileMove(result.sourcePath, result.targetPath);
		const paths = [result.sourcePath, result.targetPath];
		try {
			await this.core.git.commitFiles(
				`backlog: ${verb} milestone${result.milestone?.id ? ` ${result.milestone.id}` : ""}`,
				paths,
				repoRoot,
			);
		} catch (error) {
			await this.core.git.resetPaths(paths, repoRoot);
			await rollback();
			throw error;
		}
	}

	async createDecision(decision: Decision, autoCommit?: boolean): Promise<void> {
		const { filepath, removedFilepaths } = await this.core.fs.saveDecision(decision);
		if (await this.core.shouldAutoCommit(autoCommit))
			await this.core.commitWrittenFile(`backlog: Add decision ${decision.id}`, removedFilepaths, filepath);
	}

	async updateDecisionFromContent(decisionId: string, content: string, autoCommit?: boolean): Promise<void> {
		const existing = await this.core.fs.loadDecision(decisionId);
		if (!existing) throw new Error(`Decision ${decisionId} not found`);
		const frontmatter = parseFrontmatter(content).data as Partial<Pick<Decision, "title" | "status" | "date">>;
		const section = (name: string) =>
			content.match(new RegExp(`## ${name}\\s*([\\s\\S]*?)(?=## |$)`, "i"))?.[1]?.trim();
		await this.createDecision(
			{
				...existing,
				title: frontmatter.title || existing.title,
				status: frontmatter.status || existing.status,
				date: frontmatter.date || existing.date,
				context: section("Context") || existing.context,
				decision: section("Decision") || existing.decision,
				consequences: section("Consequences") || existing.consequences,
				alternatives: section("Alternatives") || existing.alternatives,
			},
			autoCommit,
		);
	}

	async createDecisionWithTitle(title: string, autoCommit?: boolean): Promise<Decision> {
		const decision: Decision = {
			id: await generateNextDecisionId(this.core),
			title,
			date: formatStoredDate(),
			status: "proposed",
			context: "[Describe the context and problem that needs to be addressed]",
			decision: "[Describe the decision that was made]",
			consequences: "[Describe the consequences of this decision]",
			rawContent: "",
		};
		await this.createDecision(decision, autoCommit);
		return decision;
	}

	async createDocument(document: Document, autoCommit?: boolean, subPath = ""): Promise<void> {
		const { relativePath, removedFilepaths } = await this.core.fs.saveDocument(
			document,
			normalizeDocumentSubPath(subPath),
		);
		document.path = relativePath;
		if (await this.core.shouldAutoCommit(autoCommit))
			await this.core.commitWrittenFile(
				`backlog: Add document ${document.id}`,
				removedFilepaths,
				join(this.core.fs.docsDir, ...relativePath.split("/")),
			);
	}

	async createDocumentFromInput(input: DocumentCreateInput, autoCommit?: boolean): Promise<Document> {
		const title = input.title.trim();
		if (!title) throw new Error("Title is required to create a document.");
		const tags = normalizeStringList(input.tags);
		const document = await this.core.withCreateLock(async () => {
			const created: Document = {
				id: normalizeDocumentId(await generateNextDocId(this.core)),
				title,
				type: normalizeDocumentTypeInput(input.type) ?? "other",
				createdDate: formatStoredDate(),
				rawContent: input.content ?? "",
				...(tags && tags.length > 0 && { tags }),
			};
			await this.createDocument(created, autoCommit, normalizeDocumentSubPath(input.path));
			return created;
		});
		return (await this.getDocument(document.id)) ?? document;
	}

	async updateDocumentFromInput(input: DocumentUpdateInput, autoCommit?: boolean): Promise<Document> {
		const existing = await this.getDocument(input.id);
		if (!existing) throw new Error(`Document not found: ${input.id}`);
		const title = input.title?.trim();
		if (input.title !== undefined && !title) throw new Error("Document title cannot be empty.");
		const tags = input.tags === undefined ? existing.tags : normalizeStringList(input.tags);
		const updated: Document = {
			...existing,
			id: normalizeDocumentId(existing.id),
			title: title ?? existing.title,
			type: normalizeDocumentTypeInput(input.type) ?? existing.type,
			rawContent: input.content,
			updatedDate: formatStoredDate(),
			tags: tags && tags.length > 0 ? tags : undefined,
		};
		await this.createDocument(
			updated,
			autoCommit,
			input.path === undefined
				? getDocumentSubPathFromRelativePath(existing.path)
				: normalizeDocumentSubPath(input.path),
		);
		return (await this.getDocument(existing.id)) ?? updated;
	}

	async archiveMilestone(
		identifier: string,
		autoCommit?: boolean,
	): Promise<{ success: boolean; sourcePath?: string; targetPath?: string; milestone?: Milestone }> {
		const autoCommitEnabled = await this.core.shouldAutoCommit(autoCommit);
		const result = await this.core.fs.archiveMilestone(identifier);
		if (result.success && result.sourcePath && result.targetPath && autoCommitEnabled) {
			const { sourcePath, targetPath } = result;
			await this.commitMilestoneMove("Archive", { ...result, sourcePath, targetPath }, async () => {
				await moveFile(targetPath, sourcePath).catch(() => undefined);
			});
		}
		return result;
	}

	async renameMilestone(
		identifier: string,
		title: string,
		autoCommit?: boolean,
		dueDate?: string | null,
	): Promise<{
		success: boolean;
		sourcePath?: string;
		targetPath?: string;
		milestone?: Milestone;
		previousTitle?: string;
		previousDueDate?: string;
	}> {
		const result = await this.core.fs.renameMilestone(identifier, title, dueDate);
		if (!result.success || !result.sourcePath || !result.targetPath || !(await this.core.shouldAutoCommit(autoCommit)))
			return result;
		const { sourcePath, targetPath } = result;
		await this.commitMilestoneMove("Rename", { ...result, sourcePath, targetPath }, async () => {
			await this.core.fs
				.renameMilestone(
					result.milestone?.id ?? identifier,
					result.previousTitle ?? title,
					result.previousDueDate ?? null,
				)
				.catch(() => undefined);
		});
		return result;
	}
}

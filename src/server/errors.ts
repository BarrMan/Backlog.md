import { TaskCollectionFilterError, TaskCollectionParentNotFoundError } from "../core/domain-errors.ts";
import { MilestoneWorkflowError } from "../core/milestone-workflow.ts";
import { isAmbiguousIdError } from "../utils/entity-id.ts";
import { isAmbiguousTaskIdError } from "../utils/task-path.ts";

export type ApiError = { error: string; code?: string };

/** Maps domain failures once, so resource handlers only own successful results. */
export function domainError(error: unknown): { status: 400 | 404 | 409; body: ApiError } | undefined {
	if (error instanceof TaskCollectionFilterError) return { status: 400, body: { error: error.message } };
	if (error instanceof TaskCollectionParentNotFoundError) return { status: 404, body: { error: error.message } };
	if (isAmbiguousTaskIdError(error) || isAmbiguousIdError(error))
		return { status: 409, body: { error: error.message } };
	if (error instanceof MilestoneWorkflowError)
		return {
			status: error.code === "NOT_FOUND" ? 404 : error.code === "VALIDATION_ERROR" ? 400 : 409,
			body: { error: error.message, code: error.code },
		};
}

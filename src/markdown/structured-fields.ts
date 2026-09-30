export type StructuredSectionKey = "description" | "implementationPlan" | "implementationNotes" | "finalSummary";

export interface SectionConfig {
	title: string;
	markerId: string;
}

const SECTION_CONFIG: Record<StructuredSectionKey, SectionConfig> = {
	description: { title: "Description", markerId: "DESCRIPTION" },
	implementationPlan: { title: "Implementation Plan", markerId: "PLAN" },
	implementationNotes: { title: "Implementation Notes", markerId: "NOTES" },
	finalSummary: { title: "Final Summary", markerId: "FINAL_SUMMARY" },
};

export const SECTION_INSERTION_ORDER: StructuredSectionKey[] = [
	"description",
	"implementationPlan",
	"implementationNotes",
	"finalSummary",
];

export function getSectionConfig(key: StructuredSectionKey): SectionConfig {
	return SECTION_CONFIG[key];
}

export function getSectionBeginMarker(key: StructuredSectionKey): string {
	return `<!-- SECTION:${getSectionConfig(key).markerId}:BEGIN -->`;
}

export function getSectionEndMarker(key: StructuredSectionKey): string {
	return `<!-- SECTION:${getSectionConfig(key).markerId}:END -->`;
}

export function findStructuredSectionKey(title: string): StructuredSectionKey | undefined {
	return (Object.keys(SECTION_CONFIG) as StructuredSectionKey[]).find(
		(key) => SECTION_CONFIG[key].title.toLowerCase() === title.toLowerCase(),
	);
}

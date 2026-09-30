import type { MilestoneBucket } from "../../types";

export const resolveMilestoneBucketExpanded = (
	bucket: MilestoneBucket,
	expandedBuckets: Record<string, boolean>,
	defaultExpandedByBucketKey: Record<string, boolean>,
) => expandedBuckets[bucket.key] ?? defaultExpandedByBucketKey[bucket.key] ?? (bucket.total > 0 && bucket.total <= 8);

import { z } from "zod";

export const mediaTypeSchema = z.enum(["video", "image", "thumbnail", "cover", "file"]);
export const mediaVariantSchema = z.enum(["source", "browse", "thumbnail"]);
export const presentationScopeSchema = z.enum(["public_preview", "protected_content"]);
export const mediaStatusSchema = z.enum(["pending", "available", "invalid", "withdrawn"]);

export interface VideoVariant {
  id: string;
  width: number | null;
  height: number | null;
  isPrimary: boolean;
  status: z.infer<typeof mediaStatusSchema>;
}

function pixelCount(variant: VideoVariant): number {
  return (variant.width ?? 0) * (variant.height ?? 0);
}

export function selectHighestResolutionVideo(
  variants: readonly VideoVariant[],
): VideoVariant | undefined {
  return variants
    .filter((variant) => variant.status === "available")
    .toSorted((left, right) => {
      const pixelDifference = pixelCount(right) - pixelCount(left);
      if (pixelDifference !== 0) return pixelDifference;
      if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1;
      return left.id.localeCompare(right.id);
    })[0];
}

export interface PublicCoverCandidate {
  mediaType: z.infer<typeof mediaTypeSchema>;
  variant: z.infer<typeof mediaVariantSchema> | null;
  presentationScope: z.infer<typeof presentationScopeSchema>;
  status: z.infer<typeof mediaStatusSchema>;
}

export function isValidPublicCover(candidate: PublicCoverCandidate): boolean {
  return (
    (candidate.mediaType === "image" ||
      candidate.mediaType === "thumbnail" ||
      candidate.mediaType === "cover") &&
    (candidate.variant === "browse" || candidate.variant === "thumbnail") &&
    candidate.presentationScope === "public_preview" &&
    candidate.status === "available"
  );
}

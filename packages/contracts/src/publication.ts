import type { UnitType, WorkType } from "./catalog.js";
import { isUnitTypeAllowed } from "./catalog.js";
import type { PublicCoverCandidate } from "./media.js";
import { isValidPublicCover } from "./media.js";

export interface PublicationAssetSnapshot {
  id: string;
  type: "video" | "image" | "thumbnail" | "cover" | "file";
  variant: "source" | "browse" | "thumbnail" | null;
  presentationScope: "public_preview" | "protected_content";
  status: "pending" | "available" | "invalid" | "withdrawn";
  logicalAssetId: string | null;
  mimeType: string | null;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  ordinal: number;
}

export interface PublicationUnitSnapshot {
  id: string;
  type: UnitType;
  publicationStatus: "draft" | "published" | "withdrawn";
  assets: readonly PublicationAssetSnapshot[];
}

export interface PublicationSectionSnapshot {
  id: string;
  publicationStatus: "draft" | "published" | "withdrawn";
  units: readonly PublicationUnitSnapshot[];
}

export interface WorkPublicationSnapshot {
  type: WorkType;
  publicCoverAssetId: string | null;
  publicCover: (PublicCoverCandidate & { id: string }) | null;
  sections: readonly PublicationSectionSnapshot[];
}

export type PublicationIssueCode =
  | "PUBLIC_COVER_REQUIRED"
  | "PUBLIC_COVER_INVALID"
  | "PUBLISHED_UNIT_REQUIRED"
  | "UNIT_TYPE_NOT_ALLOWED"
  | "AVAILABLE_MEDIA_REQUIRED"
  | "COMIC_VIDEO_FORBIDDEN"
  | "IMAGE_LOGICAL_ID_REQUIRED"
  | "IMAGE_VARIANT_REQUIRED"
  | "IMAGE_BROWSE_INVALID"
  | "IMAGE_PAGE_ORDER_INVALID";

export interface PublicationIssue {
  code: PublicationIssueCode;
  path: string;
  message: string;
}

const imageTypes = new Set(["image", "thumbnail", "cover"]);

function validateBrowseImage(
  asset: PublicationAssetSnapshot,
  path: string,
): PublicationIssue | null {
  const dimensionsValid =
    asset.width !== null &&
    asset.height !== null &&
    asset.width > 0 &&
    asset.height > 0 &&
    asset.width + asset.height <= 10_000 &&
    Math.max(asset.width / asset.height, asset.height / asset.width) <= 20;
  const sizeValid = asset.fileSize !== null && asset.fileSize > 0 && asset.fileSize <= 10_000_000;
  const mimeValid = asset.mimeType?.startsWith("image/") === true;

  if (dimensionsValid && sizeValid && mimeValid) return null;
  return {
    code: "IMAGE_BROWSE_INVALID",
    path,
    message: "浏览图片必须为图片 MIME、最大 10MB、宽高和不超过 10000 且宽高比不超过 20",
  };
}

export function validateWorkPublication(snapshot: WorkPublicationSnapshot): PublicationIssue[] {
  const issues: PublicationIssue[] = [];
  if (!snapshot.publicCoverAssetId || !snapshot.publicCover) {
    issues.push({
      code: "PUBLIC_COVER_REQUIRED",
      path: "publicCoverAssetId",
      message: "已发布作品必须配置独立公开展示封面",
    });
  } else if (
    snapshot.publicCover.id !== snapshot.publicCoverAssetId ||
    !isValidPublicCover(snapshot.publicCover)
  ) {
    issues.push({
      code: "PUBLIC_COVER_INVALID",
      path: "publicCoverAssetId",
      message: "公开封面必须是可用的公开浏览版本或缩略图",
    });
  }

  const publishedUnits = snapshot.sections
    .filter((section) => section.publicationStatus === "published")
    .flatMap((section) => section.units.filter((unit) => unit.publicationStatus === "published"));
  if (publishedUnits.length === 0) {
    issues.push({
      code: "PUBLISHED_UNIT_REQUIRED",
      path: "sections",
      message: "作品至少需要一个已发布内容单元",
    });
  }

  for (const unit of publishedUnits) {
    const unitPath = `units.${unit.id}`;
    if (!isUnitTypeAllowed(snapshot.type, unit.type)) {
      issues.push({
        code: "UNIT_TYPE_NOT_ALLOWED",
        path: `${unitPath}.type`,
        message: `作品类型 ${snapshot.type} 不允许内容单元 ${unit.type}`,
      });
    }

    const availableAssets = unit.assets.filter((asset) => asset.status === "available");
    if (availableAssets.length === 0) {
      issues.push({
        code: "AVAILABLE_MEDIA_REQUIRED",
        path: `${unitPath}.assets`,
        message: "已发布内容单元至少需要一个可用媒体资源",
      });
      continue;
    }

    if (snapshot.type === "comic" && availableAssets.some((asset) => asset.type === "video")) {
      issues.push({
        code: "COMIC_VIDEO_FORBIDDEN",
        path: `${unitPath}.assets`,
        message: "漫画作品不允许包含视频资源",
      });
    }

    const images = availableAssets.filter((asset) => imageTypes.has(asset.type));
    const groups = new Map<string, PublicationAssetSnapshot[]>();
    for (const asset of images) {
      if (!asset.logicalAssetId) {
        issues.push({
          code: "IMAGE_LOGICAL_ID_REQUIRED",
          path: `${unitPath}.assets.${asset.id}.logicalAssetId`,
          message: "图片版本必须关联逻辑资源 ID",
        });
        continue;
      }
      const group = groups.get(asset.logicalAssetId) ?? [];
      group.push(asset);
      groups.set(asset.logicalAssetId, group);
    }

    const pageOrders: number[] = [];
    for (const [logicalAssetId, group] of groups) {
      const variants = new Set(group.map((asset) => asset.variant));
      for (const required of ["source", "browse", "thumbnail"] as const) {
        if (!variants.has(required)) {
          issues.push({
            code: "IMAGE_VARIANT_REQUIRED",
            path: `${unitPath}.images.${logicalAssetId}.${required}`,
            message: `逻辑图片缺少 ${required} 版本`,
          });
        }
      }
      const browse = group.find((asset) => asset.variant === "browse");
      if (browse) {
        const browseIssue = validateBrowseImage(browse, `${unitPath}.assets.${browse.id}`);
        if (browseIssue) issues.push(browseIssue);
        pageOrders.push(browse.ordinal);
      }
    }

    const uniqueOrders = [...new Set(pageOrders)].toSorted((left, right) => left - right);
    if (
      uniqueOrders.length !== pageOrders.length ||
      uniqueOrders.some((order, index) => order !== index)
    ) {
      issues.push({
        code: "IMAGE_PAGE_ORDER_INVALID",
        path: `${unitPath}.assets.ordinal`,
        message: "图片页序必须从 0 开始且连续唯一",
      });
    }
  }

  return issues;
}

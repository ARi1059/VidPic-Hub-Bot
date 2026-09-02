import { z } from "zod";

export const accessLevelSchema = z.enum(["public", "member"]);
export type AccessLevel = z.infer<typeof accessLevelSchema>;

export const accessStateSchema = z.enum(["full", "partial", "locked"]);
export type AccessState = z.infer<typeof accessStateSchema>;

export const publicationStatusSchema = z.enum(["draft", "published", "withdrawn"]);
export type PublicationStatus = z.infer<typeof publicationStatusSchema>;

export interface AccessUnitInput {
  id: string;
  accessLevel: AccessLevel | null;
  publicationStatus: PublicationStatus;
}

export interface AccessSectionInput {
  id: string;
  accessLevel: AccessLevel | null;
  publicationStatus: PublicationStatus;
  units: readonly AccessUnitInput[];
}

export interface WorkAccessInput {
  workAccessLevel: AccessLevel | null;
  membershipEnabled: boolean;
  memberActive: boolean;
  sections: readonly AccessSectionInput[];
}

export interface ResolvedAccessUnit extends AccessUnitInput {
  effectiveAccessLevel: AccessLevel;
}

export interface ResolvedAccessSection {
  id: string;
  effectiveAccessLevel: AccessLevel;
  units: ResolvedAccessUnit[];
}

export interface WorkAccessResult {
  state: AccessState;
  containsMemberContent: boolean;
  visibleSections: ResolvedAccessSection[];
  publishedUnitCount: number;
  visibleUnitCount: number;
}

export function resolveAccessLevel(
  unit: Pick<AccessUnitInput, "accessLevel">,
  section: Pick<AccessSectionInput, "accessLevel">,
  workAccessLevel: AccessLevel | null,
): AccessLevel {
  return unit.accessLevel ?? section.accessLevel ?? workAccessLevel ?? "public";
}

export function resolveWorkAccess(input: WorkAccessInput): WorkAccessResult {
  const publishedSections = input.sections
    .filter((section) => section.publicationStatus === "published")
    .map((section) => {
      const effectiveSectionLevel = section.accessLevel ?? input.workAccessLevel ?? "public";
      const units = section.units
        .filter((unit) => unit.publicationStatus === "published")
        .map<ResolvedAccessUnit>((unit) => ({
          ...unit,
          effectiveAccessLevel: resolveAccessLevel(unit, section, input.workAccessLevel),
        }));

      return {
        id: section.id,
        effectiveAccessLevel: effectiveSectionLevel,
        units,
      } satisfies ResolvedAccessSection;
    })
    .filter((section) => section.units.length > 0);

  const publishedUnitCount = publishedSections.reduce(
    (count, section) => count + section.units.length,
    0,
  );
  const bypassMembership = !input.membershipEnabled || input.memberActive;

  const visibleSections = publishedSections
    .map((section) => ({
      ...section,
      units: bypassMembership
        ? section.units
        : section.units.filter((unit) => unit.effectiveAccessLevel === "public"),
    }))
    .filter((section) => section.units.length > 0);

  const visibleUnitCount = visibleSections.reduce(
    (count, section) => count + section.units.length,
    0,
  );
  const restrictedUnitCount = bypassMembership ? 0 : publishedUnitCount - visibleUnitCount;

  let state: AccessState;
  if (publishedUnitCount === 0 || visibleUnitCount === 0) {
    state = "locked";
  } else if (restrictedUnitCount > 0) {
    state = "partial";
  } else {
    state = "full";
  }

  return {
    state,
    containsMemberContent: restrictedUnitCount > 0,
    visibleSections,
    publishedUnitCount,
    visibleUnitCount,
  };
}

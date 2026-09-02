import { describe, expect, it } from "vitest";

import { resolveWorkAccess, type AccessLevel } from "./access.js";

const unit = (id: string, accessLevel: AccessLevel | null) => ({
  id,
  accessLevel,
  publicationStatus: "published" as const,
});

const resolve = (
  workAccessLevel: AccessLevel | null,
  levels: readonly (AccessLevel | null)[],
  overrides: Partial<{ membershipEnabled: boolean; memberActive: boolean }> = {},
) =>
  resolveWorkAccess({
    workAccessLevel,
    membershipEnabled: overrides.membershipEnabled ?? true,
    memberActive: overrides.memberActive ?? false,
    sections: [
      {
        id: "section",
        accessLevel: null,
        publicationStatus: "published",
        units: levels.map((level, index) => unit(`unit-${index}`, level)),
      },
    ],
  });

describe("resolveWorkAccess", () => {
  it("locks an inherited member work", () => {
    expect(resolve("member", [null]).state).toBe("locked");
  });

  it("returns partial when a member parent has public and member children", () => {
    const result = resolve("member", ["public", null]);

    expect(result.state).toBe("partial");
    expect(result.visibleSections[0]?.units.map((item) => item.id)).toEqual(["unit-0"]);
  });

  it("returns full when every child explicitly overrides a member parent", () => {
    expect(resolve("member", ["public", "public"]).state).toBe("full");
  });

  it("filters a member child below a public work", () => {
    expect(resolve("public", ["public", "member"]).state).toBe("partial");
  });

  it("returns all published content to members or while the switch is off", () => {
    expect(resolve("member", [null], { memberActive: true }).state).toBe("full");
    expect(resolve("member", [null], { membershipEnabled: false }).state).toBe("full");
  });

  it("ignores draft units and empty sections", () => {
    const result = resolveWorkAccess({
      workAccessLevel: "public",
      membershipEnabled: true,
      memberActive: false,
      sections: [
        {
          id: "empty",
          accessLevel: null,
          publicationStatus: "published",
          units: [{ id: "draft", accessLevel: null, publicationStatus: "draft" }],
        },
      ],
    });

    expect(result.state).toBe("locked");
    expect(result.visibleSections).toEqual([]);
  });
});

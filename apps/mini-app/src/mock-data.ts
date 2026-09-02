import type {
  ReadingHistoryItem,
  ReadingProgress,
  UnitImageManifest,
  WorkDetail,
  WorkListItem,
} from "@film-bot/contracts";

export function mockId(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

const expiresAt = "2099-01-01T00:00:00.000Z";

function cover(asset: number, imageId: string) {
  return {
    assetId: mockId(asset),
    url: `https://images.unsplash.com/photo-${imageId}?auto=format&fit=crop&w=900&q=85`,
    width: 900,
    height: 1200,
  };
}

function metadata(input: {
  year: number;
  region: string;
  tags: string[];
  actors?: string[];
  authors?: string[];
  photographers?: string[];
}) {
  return {
    originalTitle: "未知",
    aliases: ["未知"],
    region: input.region,
    year: input.year,
    releaseDate: "未知",
    language: "未知",
    tags: input.tags,
    releaseStatus: "已发布",
    contentRating: "未知",
    directors: ["未知"],
    actors: input.actors ?? ["未知"],
    screenwriters: ["未知"],
    producers: ["未知"],
    productionCompanies: ["未知"],
    totalEpisodes: "未知" as const,
    durationSeconds: "未知" as const,
    authors: input.authors ?? ["未知"],
    originalAuthors: ["未知"],
    artists: ["未知"],
    publisher: "未知",
    serializationPlatform: "未知",
    serializationStatus: "未知",
    photographers: input.photographers ?? ["未知"],
    subjects: ["未知"],
    studio: "未知",
    shootDate: "未知",
    location: "未知",
    volumeCount: "未知" as const,
  };
}

function unit(
  id: number,
  type:
    | "movie"
    | "episode"
    | "short_video"
    | "comic_chapter"
    | "image_set"
    | "photoshoot_set"
    | "behind_the_scenes_video",
  title: string,
  ordinal: number,
  accessLevel: "public" | "member" | null = null,
) {
  return {
    id: mockId(id),
    type,
    title,
    ordinal,
    accessLevel,
    publicationStatus: "published" as const,
  };
}

export const mockWorkDetails: WorkDetail[] = [
  {
    id: mockId(101),
    type: "video",
    subtype: "series",
    title: "北境来信",
    summary: "一封未寄出的信，让两条相隔二十年的调查线重新交汇。",
    accessLevel: "public",
    accessState: "partial",
    publicCover: cover(401, "1489599849927-2ee91cede3ba"),
    metadata: metadata({
      year: 2026,
      region: "英国",
      tags: ["剧情", "悬疑", "本周热门"],
      actors: ["艾琳·摩尔", "丹尼尔·怀特"],
    }),
    memberBadge: true,
    containsMemberContent: true,
    membershipCta: {
      label: "开通会员",
      url: "https://t.me/example_bot?start=member_demo",
      expiresAt,
    },
    sections: [
      {
        id: mockId(201),
        type: "episodes",
        title: "选集",
        ordinal: 0,
        units: [unit(301, "episode", "第 1 集 雪线", 0, "public")],
      },
      {
        id: mockId(202),
        type: "stills",
        title: "剧照",
        ordinal: 1,
        units: [unit(303, "image_set", "拍摄现场", 0, "public")],
      },
    ],
  },
  {
    id: mockId(102),
    type: "comic",
    subtype: "serial",
    title: "纸上城",
    summary: "城市会在每个午夜重画边界，只有制图师记得昨天的道路。",
    accessLevel: "public",
    accessState: "full",
    publicCover: cover(402, "1543002588-bfa74002ed7e"),
    metadata: metadata({
      year: 2026,
      region: "日本",
      tags: ["奇幻", "冒险", "连载"],
      authors: ["青木遥"],
    }),
    memberBadge: false,
    containsMemberContent: false,
    sections: [
      {
        id: mockId(203),
        type: "comic_catalog",
        title: "漫画目录",
        ordinal: 0,
        units: [
          unit(304, "comic_chapter", "第 1 话 起点", 0),
          unit(305, "comic_chapter", "第 2 话 断桥", 1),
          unit(306, "comic_chapter", "第 3 话 白塔", 2),
        ],
      },
    ],
  },
  {
    id: mockId(103),
    type: "gallery",
    subtype: "travel",
    title: "沿海公路",
    summary: "从清晨到入夜，记录一段无人催促的沿海行程。",
    accessLevel: "public",
    accessState: "full",
    publicCover: cover(403, "1500530855697-b586d89ba3ee"),
    metadata: metadata({
      year: 2026,
      region: "中国",
      tags: ["旅行", "胶片", "海岸"],
      photographers: ["林屿"],
    }),
    memberBadge: false,
    containsMemberContent: false,
    sections: [
      {
        id: mockId(204),
        type: "gallery",
        title: "图集",
        ordinal: 0,
        units: [unit(307, "image_set", "第一辑 清晨", 0), unit(308, "image_set", "第二辑 入夜", 1)],
      },
    ],
  },
  {
    id: mockId(104),
    type: "photoshoot",
    subtype: "portrait",
    title: "七号摄影棚",
    summary: "一组以自然光和舞台调度为核心的棚拍企划。",
    accessLevel: "member",
    accessState: "locked",
    publicCover: cover(404, "1534528741775-53994a69daeb"),
    metadata: metadata({
      year: 2025,
      region: "韩国",
      tags: ["人像", "幕后", "棚拍"],
      photographers: ["Han Studio"],
    }),
    memberBadge: true,
    membershipCta: {
      label: "开通会员浏览",
      url: "https://t.me/example_bot?start=member_demo",
      expiresAt,
    },
  },
  {
    id: mockId(105),
    type: "video",
    subtype: "movie",
    title: "余晖之后",
    summary: "一次临时返乡，让家人重新看见彼此沉默背后的选择。",
    accessLevel: "public",
    accessState: "full",
    publicCover: cover(405, "1481627834876-b7833e8f5570"),
    metadata: metadata({ year: 2025, region: "法国", tags: ["文艺", "家庭"] }),
    memberBadge: false,
    containsMemberContent: false,
    sections: [
      {
        id: mockId(205),
        type: "play",
        title: "播放",
        ordinal: 0,
        units: [unit(309, "movie", "正片", 0)],
      },
    ],
  },
  {
    id: mockId(106),
    type: "gallery",
    subtype: "landscape",
    title: "蓝调时刻",
    summary: "太阳落下之后，城市和旷野共享的短暂蓝色。",
    accessLevel: "public",
    accessState: "full",
    publicCover: cover(406, "1519904981063-b0cf448d479e"),
    metadata: metadata({ year: 2024, region: "冰岛", tags: ["风景", "夜色", "长曝光"] }),
    memberBadge: false,
    containsMemberContent: false,
    sections: [
      {
        id: mockId(206),
        type: "gallery",
        title: "图集",
        ordinal: 0,
        units: [unit(310, "image_set", "完整图集", 0)],
      },
    ],
  },
  {
    id: mockId(107),
    type: "photoshoot",
    subtype: "editorial",
    title: "光线练习册",
    summary: "用一整天的光线变化完成一组安静、克制的人像记录。",
    accessLevel: "public",
    accessState: "full",
    publicCover: cover(407, "1492562080023-ab3db95bfbce"),
    metadata: metadata({
      year: 2026,
      region: "中国",
      tags: ["写真", "自然光", "幕后"],
      photographers: ["陈明川"],
    }),
    memberBadge: false,
    containsMemberContent: false,
    sections: [
      {
        id: mockId(207),
        type: "photoshoot",
        title: "写真",
        ordinal: 0,
        units: [unit(311, "photoshoot_set", "窗边自然光", 0)],
      },
      {
        id: mockId(208),
        type: "behind_the_scenes",
        title: "拍摄花絮",
        ordinal: 1,
        units: [unit(312, "behind_the_scenes_video", "布光与现场", 0)],
      },
    ],
  },
];

export const mockWorks: WorkListItem[] = mockWorkDetails.map((work) => {
  if (work.accessState === "locked") return structuredClone(work);
  const { sections, ...summary } = work;
  void sections;
  return structuredClone(summary);
});

const galleryPool = [
  "1500530855697-b586d89ba3ee",
  "1470770841072-f978cf4d019e",
  "1507525428034-b723cf961d3e",
  "1494783367193-149034c05e8f",
  "1500534314209-a25ddb2bd429",
  "1519904981063-b0cf448d479e",
];

const portraitPool = [
  "1492562080023-ab3db95bfbce",
  "1524504388940-b1c1722653e1",
  "1500648767791-00dcc994a43e",
  "1508214751196-bcfd4ca60f91",
  "1531123897727-8f129e1688ce",
  "1517841905240-472988babdf9",
];

const comicPool = [
  "1519682337058-a94d519337bc",
  "1518005020951-eccb494ad742",
  "1485846234645-a62644f84728",
  "1440404653325-ab127d49abc1",
  "1517604931442-7e0c8ed2963c",
  "1489599849927-2ee91cede3ba",
  "1543002588-bfa74002ed7e",
  "1481627834876-b7833e8f5570",
];

function imageUrl(imageId: string, width: number) {
  return `https://images.unsplash.com/photo-${imageId}?auto=format&fit=crop&w=${width}&q=86`;
}

function manifest(
  unitId: number,
  workId: number,
  title: string,
  type: "comic_chapter" | "image_set" | "photoshoot_set",
  imageIds: string[],
): UnitImageManifest {
  const portrait = type !== "image_set";
  return {
    unit: { id: mockId(unitId), workId: mockId(workId), title, type },
    images: imageIds.map((imageId, index) => ({
      logicalAssetId: mockId(unitId * 100 + index),
      ordinal: index,
      browse: {
        assetId: mockId(unitId * 1000 + index * 2),
        url: imageUrl(imageId, 1600),
        width: portrait ? 1200 : 1600,
        height: portrait ? 1680 : 1100,
        mimeType: "image/jpeg",
      },
      thumbnail: {
        assetId: mockId(unitId * 1000 + index * 2 + 1),
        url: imageUrl(imageId, 480),
        width: portrait ? 480 : 640,
        height: portrait ? 672 : 440,
        mimeType: "image/jpeg",
      },
    })),
    progress: null,
  };
}

export const mockImageManifests = new Map<string, UnitImageManifest>([
  [mockId(303), manifest(303, 101, "拍摄现场", "image_set", galleryPool.slice(0, 5))],
  [mockId(304), manifest(304, 102, "第 1 话 起点", "comic_chapter", comicPool)],
  [mockId(305), manifest(305, 102, "第 2 话 断桥", "comic_chapter", [...comicPool].reverse())],
  [mockId(306), manifest(306, 102, "第 3 话 白塔", "comic_chapter", comicPool.slice(1))],
  [mockId(307), manifest(307, 103, "第一辑 清晨", "image_set", galleryPool)],
  [mockId(308), manifest(308, 103, "第二辑 入夜", "image_set", [...galleryPool].reverse())],
  [mockId(310), manifest(310, 106, "完整图集", "image_set", galleryPool.slice(1))],
  [mockId(311), manifest(311, 107, "窗边自然光", "photoshoot_set", portraitPool)],
]);

export function mockHistoryFromProgress(
  progressByUnit: ReadonlyMap<string, ReadingProgress>,
): ReadingHistoryItem[] {
  return [...progressByUnit.values()]
    .flatMap((progress) => {
      const detail = mockWorkDetails.find((work) =>
        work.accessState === "locked"
          ? false
          : work.sections.some((section) =>
              section.units.some((item) => item.id === progress.unitId),
            ),
      );
      if (!detail) return [];
      const unitTitle =
        detail.accessState === "locked"
          ? "未知"
          : (detail.sections
              .flatMap((section) => section.units)
              .find((item) => item.id === progress.unitId)?.title ?? "未知");
      return [
        {
          workId: detail.id,
          workTitle: detail.title,
          workType: detail.type,
          publicCover: detail.publicCover,
          unitId: progress.unitId,
          unitTitle,
          progress,
        },
      ];
    })
    .sort((left, right) => right.progress.updatedAt.localeCompare(left.progress.updatedAt));
}

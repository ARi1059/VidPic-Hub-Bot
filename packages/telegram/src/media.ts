export interface TelegramPhotoSize {
  fileId: string;
  width: number;
  height: number;
  fileSize?: number;
}

export function choosePhotoPreview(
  sizes: readonly TelegramPhotoSize[],
  viewportWidth: number,
  devicePixelRatio: number,
): TelegramPhotoSize | undefined {
  const targetWidth = Math.max(1, viewportWidth * Math.max(1, devicePixelRatio));
  const sorted = sizes.toSorted((left, right) => left.width - right.width);
  return sorted.find((size) => size.width >= targetWidth) ?? sorted.at(-1);
}

export interface CopyProtectedVideoInput {
  targetChatId: string | number;
  sourceChatId: string | number;
  sourceMessageId: number;
  caption?: string;
}

export function protectedCopyOptions(input: CopyProtectedVideoInput) {
  return {
    chat_id: input.targetChatId,
    from_chat_id: input.sourceChatId,
    message_id: input.sourceMessageId,
    protect_content: true as const,
    ...(input.caption ? { caption: input.caption } : {}),
  };
}

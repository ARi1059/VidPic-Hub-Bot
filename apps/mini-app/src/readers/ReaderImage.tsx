import { useState } from "react";
import { ImageOff, RotateCcw } from "lucide-react";

export function ReaderImage(props: {
  src: string;
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
}) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className="image-failure" role="status">
        <ImageOff size={21} />
        <span>图片加载失败</span>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setAttempt((value) => value + 1);
            setFailed(false);
          }}
        >
          <RotateCcw size={15} />
          重试
        </button>
      </span>
    );
  }

  return (
    <img
      key={attempt}
      src={props.src}
      alt={props.alt}
      className={props.className}
      loading={props.loading ?? "lazy"}
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      onContextMenu={(event) => event.preventDefault()}
    />
  );
}

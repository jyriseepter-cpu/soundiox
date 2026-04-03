"use client";

type LikeButtonProps = {
  trackId: string;
  liked: boolean;
  likesCount?: number | null;
  onToggle: (trackId: string) => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  title?: string;
  wrapperClassName?: string;
  buttonClassName?: string;
  showCount?: boolean;
};

export default function LikeButton({
  trackId,
  liked,
  likesCount = null,
  onToggle,
  disabled = false,
  loading = false,
  title,
  wrapperClassName = "flex items-center justify-end gap-3 text-right tabular-nums text-white/80",
  buttonClassName = "text-xl",
  showCount = false,
}: LikeButtonProps) {
  return (
    <div className={wrapperClassName}>
      {showCount && likesCount !== null ? <span>{likesCount}</span> : null}
      <button
        type="button"
        onClick={() => void onToggle(trackId)}
        disabled={disabled || loading}
        title={title}
        data-track-id={trackId}
        className={`${buttonClassName} leading-none transition ${
          liked ? "text-red-500" : "text-cyan-300 hover:text-cyan-200"
        } ${!liked && disabled ? "opacity-50" : ""}`.trim()}
      >
        {loading ? "..." : "♥"}
      </button>
    </div>
  );
}

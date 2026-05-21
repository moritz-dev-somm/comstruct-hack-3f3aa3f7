import { useState } from "react";

export function ProductImage({
  src,
  alt,
  className = "",
  fallbackClassName = "",
  fallbackEmoji = "📦",
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  fallbackClassName?: string;
  fallbackEmoji?: string;
}) {
  const [errored, setErrored] = useState(false);
  if (!src || errored) {
    return (
      <div className={`grid place-items-center bg-muted/50 ${fallbackClassName || className}`}>
        <span aria-hidden>{fallbackEmoji}</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setErrored(true)}
      className={`object-contain bg-white ${className}`}
    />
  );
}

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ExtensionComponentOverrideRenderer, useExtensions } from "../extensions/ExtensionLoader";

export const ENTITY_MEDIA_TARGET = "entity.media" as const;

export type EntityMediaSurface =
  | "card"
  | "hero"
  | "list"
  | "picker"
  | "recommendation"
  | "dialog"
  | "hover";

export type EntityMediaFit = "cover" | "contain";

export interface EntityMediaRenderProps {
  entityType: string;
  entityId: number;
  surface: EntityMediaSurface;
  imageUrl?: string | null;
  alt: string;
  fit: EntityMediaFit;
  loading?: "eager" | "lazy";
  className?: string;
  renderDefault: () => ReactNode;
}

interface EntityMediaHoverProps extends Omit<EntityMediaRenderProps, "surface" | "className" | "renderDefault"> {
  children: ReactNode;
  wrapperClassName?: string;
}

/**
 * Stable extension boundary for an entity's primary visual media. The host keeps
 * navigation and card chrome outside this component while extensions may replace
 * or wrap only the native media renderer.
 */
export function EntityMedia({ renderDefault, ...componentProps }: EntityMediaRenderProps) {
  const resetKey = JSON.stringify([
    componentProps.entityType,
    componentProps.entityId,
    componentProps.surface,
    componentProps.imageUrl ?? null,
    componentProps.alt,
    componentProps.fit,
    componentProps.loading ?? null,
    componentProps.className ?? null,
  ]);

  return (
    <ExtensionComponentOverrideRenderer
      targetComponent={ENTITY_MEDIA_TARGET}
      componentProps={componentProps}
      renderDefault={renderDefault}
      resetKey={resetKey}
    />
  );
}

/**
 * Optional hover surface for entity references. The host owns positioning,
 * containment, and the supplied static image; an entity.media override may
 * replace that image and owns any additional data fetching. With neither
 * static media nor an active override this returns the reference unchanged.
 */
export function EntityMediaHover({ children, wrapperClassName = "inline-flex", ...mediaProps }: EntityMediaHoverProps) {
  const { getComponentOverrides } = useExtensions();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const staticImageUrl = mediaProps.imageUrl || null;
  const hasStaticImage = Boolean(staticImageUrl) && failedImageUrl !== staticImageUrl;
  const enabled = hasStaticImage || getComponentOverrides(ENTITY_MEDIA_TARGET).length > 0;

  const renderStaticImage = () => staticImageUrl && failedImageUrl !== staticImageUrl ? (
    <img
      src={staticImageUrl}
      alt={mediaProps.alt}
      className={`h-full w-full ${mediaProps.fit === "contain" ? "object-contain" : "object-cover"}`}
      loading={mediaProps.loading}
      onError={() => setFailedImageUrl(staticImageUrl)}
    />
  ) : null;

  useLayoutEffect(() => {
    if (!enabled || !open) return;

    const place = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const width = 288;
      const height = 216;
      const margin = 8;
      const left = Math.min(Math.max(margin, anchor.left), window.innerWidth - width - margin);
      const top = anchor.top - height - margin >= margin
        ? anchor.top - height - margin
        : Math.min(anchor.bottom + margin, window.innerHeight - height - margin);
      setPosition({ left, top: Math.max(margin, top) });
    };

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [enabled, open]);

  if (!enabled) return <>{children}</>;

  return (
    <span
      ref={anchorRef}
      className={`relative ${wrapperClassName}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      {children}
      {open && typeof document !== "undefined" ? createPortal(
        <span
          role="tooltip"
          aria-label={`Media for ${mediaProps.alt}`}
          className="pointer-events-none fixed z-[10000] block aspect-[4/3] w-72 overflow-hidden rounded-xl border border-border bg-surface/95 shadow-2xl empty:hidden"
          style={position}
        >
          <EntityMedia
            {...mediaProps}
            surface="hover"
            className="h-full w-full"
            renderDefault={renderStaticImage}
          />
        </span>,
        document.body,
      ) : null}
    </span>
  );
}

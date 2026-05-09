"use client";

import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type * as React from "react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src: string;
  alt?: string;
};

export function ImageLightbox({ open, onOpenChange, src, alt }: Props): React.ReactElement {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex items-center justify-center p-4 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 sm:p-8"
          onClick={() => onOpenChange(false)}
        >
          <DialogPrimitive.Title className="sr-only">
            {alt || "Image preview"}
          </DialogPrimitive.Title>
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: image stops propagation; ESC handled by Radix */}
          <img
            src={src}
            alt={alt ?? ""}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-md object-contain shadow-2xl data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=open]:zoom-in-95"
          />
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute top-4 right-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-background/90 text-foreground shadow-md ring-offset-background transition-colors hover:bg-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
          >
            <XIcon className="h-5 w-5" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

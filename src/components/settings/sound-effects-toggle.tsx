"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { isSoundEnabled, playSound, setSoundEnabled } from "@/lib/sounds";

const OPTIONS = [
  { value: true, label: "On", Icon: Volume2 },
  { value: false, label: "Off", Icon: VolumeX },
] as const;

export function SoundEffectsToggle(): React.ReactElement {
  const [enabled, setEnabledState] = useState<boolean | null>(null);

  useEffect(() => {
    setEnabledState(isSoundEnabled());
  }, []);

  const onSelect = (value: boolean): void => {
    setEnabledState(value);
    setSoundEnabled(value);
    if (value) playSound("statusChanged");
  };

  return (
    <div
      role="radiogroup"
      aria-label="Sound effects"
      className="inline-flex items-center gap-1 rounded-md border bg-muted/30 p-1"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const selected = enabled === value;
        return (
          <Button
            key={label}
            type="button"
            role="radio"
            aria-checked={selected}
            variant={selected ? "default" : "ghost"}
            size="sm"
            onClick={() => onSelect(value)}
            className="gap-1.5"
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Button>
        );
      })}
    </div>
  );
}

"use client";

import { SendHorizonal } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  onSend: (text: string) => void;
  disabled?: boolean;
  compact?: boolean;
  placeholder?: string;
};

export function Composer({ onSend, disabled, compact, placeholder }: Props) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = useCallback(() => {
    const v = value.trim();
    if (!v || disabled) return;
    onSend(v);
    setValue("");
    ref.current?.focus();
  }, [value, disabled, onSend]);

  return (
    <div className="flex items-end gap-2">
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder ?? "Ask Planbooq AI… (Cmd+Enter to send)"}
        disabled={disabled}
        rows={compact ? 1 : 2}
        className={
          compact
            ? "max-h-[40px] min-h-[36px] resize-none py-1.5"
            : "max-h-[120px] min-h-[40px] resize-none"
        }
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
      />
      <Button
        type="button"
        size={compact ? "icon-sm" : "icon"}
        onClick={submit}
        disabled={disabled || !value.trim()}
        aria-label="Send message"
      >
        <SendHorizonal />
      </Button>
    </div>
  );
}

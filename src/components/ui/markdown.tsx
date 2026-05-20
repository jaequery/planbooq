import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

type Props = {
  children: string;
  className?: string;
  onSourceChange?: (nextSource: string) => void;
};

function toggleTaskAtOffset(source: string, lineStart: number): string | null {
  const newlineIdx = source.indexOf("\n", lineStart);
  const lineEnd = newlineIdx === -1 ? source.length : newlineIdx;
  const segment = source.slice(lineStart, lineEnd);
  const match = segment.match(/^(\s*[-*+]\s+)\[([ xX])\]/);
  const prefix = match?.[1];
  if (!match || prefix === undefined) return null;
  const boxCharIdx = lineStart + prefix.length + 1;
  const current = source[boxCharIdx];
  const nextChar = current === " " ? "x" : " ";
  return source.slice(0, boxCharIdx) + nextChar + source.slice(boxCharIdx + 1);
}

export function Markdown({ children, className, onSourceChange }: Props): React.ReactElement {
  const interactive = typeof onSourceChange === "function";
  return (
    <div
      className={cn(
        "break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        "[&_h1]:my-2 [&_h1]:text-[15px] [&_h1]:font-semibold",
        "[&_h2]:my-2 [&_h2]:text-[14px] [&_h2]:font-semibold",
        "[&_h3]:my-2 [&_h3]:text-[13px] [&_h3]:font-semibold",
        "[&_h4]:my-2 [&_h4]:text-[13px] [&_h4]:font-semibold",
        "[&_h5]:my-2 [&_h5]:text-[13px] [&_h5]:font-semibold",
        "[&_h6]:my-2 [&_h6]:text-[13px] [&_h6]:font-semibold",
        "[&_p]:my-2 [&_p]:leading-relaxed",
        "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5",
        "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5",
        "[&_li]:leading-relaxed",
        "[&_li>p]:my-0",
        "[&_li.task-list-item]:flex [&_li.task-list-item]:list-none [&_li.task-list-item]:items-start [&_li.task-list-item]:gap-2 [&_li.task-list-item]:-ml-5 [&_li.task-list-item]:pl-0",
        "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_a]:break-all hover:[&_a]:no-underline",
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.92em] [&_code]:font-mono",
        "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2",
        "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
        "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
        "[&_hr]:my-3 [&_hr]:border-border",
        "[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[12px]",
        "[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold",
        "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1",
        "[&_input[type=checkbox]]:mr-1.5 [&_input[type=checkbox]]:align-middle",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, href, children: linkChildren, ...rest }) => (
            <a href={href} target="_blank" rel="noreferrer noopener" {...rest}>
              {linkChildren}
            </a>
          ),
          img: ({ node: _node, src, alt, ...rest }) => {
            if (typeof src !== "string" || src.length === 0) {
              return (
                <span className="text-[12px] italic text-muted-foreground">
                  {alt ?? "uploading…"}
                </span>
              );
            }
            return (
              <img
                src={src}
                alt={alt ?? ""}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="max-w-full h-auto rounded border border-border"
                {...rest}
              />
            );
          },
          li: ({ node, children: liChildren, className: liClassName, ...rest }) => {
            const checked = (node as unknown as { checked?: boolean | null } | undefined)?.checked;
            const isTask = typeof checked === "boolean";
            if (!isTask) {
              return (
                <li className={liClassName} {...rest}>
                  {liChildren}
                </li>
              );
            }
            const offset = (
              node as unknown as { position?: { start?: { offset?: number } } } | undefined
            )?.position?.start?.offset;
            const handleToggle = (): void => {
              if (!interactive || typeof offset !== "number") return;
              const next = toggleTaskAtOffset(children, offset);
              if (next && next !== children) onSourceChange?.(next);
            };
            return (
              <li className={cn("task-list-item", liClassName)} {...rest}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={handleToggle}
                  onClick={(event) => event.stopPropagation()}
                  disabled={!interactive}
                  aria-label={checked ? "Mark item not done" : "Mark item done"}
                  className={cn(
                    "mt-[5px] h-3.5 w-3.5 shrink-0 cursor-pointer accent-primary",
                    !interactive && "cursor-default opacity-70",
                  )}
                />
                <div className="min-w-0 flex-1">{liChildren}</div>
              </li>
            );
          },
          // Suppress the default GFM-emitted disabled checkbox so our custom
          // one (rendered in the `li` above) is the only checkbox shown.
          input: ({ node: _node, type, ...rest }) => {
            if (type === "checkbox") return null;
            return <input type={type} {...rest} />;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

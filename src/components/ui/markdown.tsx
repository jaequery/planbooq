import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

type Props = {
  children: string;
  className?: string;
};

export function Markdown({ children, className }: Props): React.ReactElement {
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
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

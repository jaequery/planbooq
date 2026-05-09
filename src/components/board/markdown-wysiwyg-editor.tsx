"use client";

import {
  MDXEditor,
  type MDXEditorMethods,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  linkPlugin,
  linkDialogPlugin,
  tablePlugin,
  codeBlockPlugin,
  codeMirrorPlugin,
  toolbarPlugin,
  UndoRedo,
  BoldItalicUnderlineToggles,
  ListsToggle,
  BlockTypeSelect,
  CreateLink,
  InsertCodeBlock,
  InsertTable,
  InsertThematicBreak,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import { useEffect, useRef } from "react";

type Props = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
};

export default function MarkdownWysiwygEditor({
  value,
  onChange,
  placeholder,
}: Props): React.ReactElement {
  const ref = useRef<MDXEditorMethods | null>(null);

  // Keep editor in sync when the underlying doc changes (e.g., tab switch).
  useEffect(() => {
    const cur = ref.current?.getMarkdown();
    if (cur !== value) ref.current?.setMarkdown(value);
  }, [value]);

  return (
    <div className="mdx-wysiwyg h-64 max-h-[60vh] resize-y overflow-auto rounded-md border border-border/60 bg-background text-[13px]">
      <MDXEditor
        ref={ref}
        markdown={value}
        onChange={onChange}
        placeholder={placeholder}
        contentEditableClassName="prose prose-sm max-w-none px-3 py-2 outline-none dark:prose-invert"
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          tablePlugin(),
          codeBlockPlugin({ defaultCodeBlockLanguage: "" }),
          codeMirrorPlugin({
            codeBlockLanguages: {
              "": "Plain text",
              ts: "TypeScript",
              tsx: "TSX",
              js: "JavaScript",
              json: "JSON",
              bash: "Shell",
              md: "Markdown",
            },
          }),
          markdownShortcutPlugin(),
          toolbarPlugin({
            toolbarContents: () => (
              <>
                <UndoRedo />
                <BoldItalicUnderlineToggles />
                <BlockTypeSelect />
                <ListsToggle />
                <CreateLink />
                <InsertCodeBlock />
                <InsertTable />
                <InsertThematicBreak />
              </>
            ),
          }),
        ]}
      />
    </div>
  );
}

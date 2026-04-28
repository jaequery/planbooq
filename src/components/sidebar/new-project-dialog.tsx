"use client";

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { createProject } from "@/actions/project";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const PRESET_COLORS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "#6366f1", label: "Indigo" },
  { value: "#10b981", label: "Emerald" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#ef4444", label: "Red" },
  { value: "#8b5cf6", label: "Violet" },
  { value: "#06b6d4", label: "Cyan" },
  { value: "#ec4899", label: "Pink" },
  { value: "#64748b", label: "Slate" },
];

const Schema = z.object({
  name: z.string().min(1, "Name is required").max(80),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(60)
    .regex(SLUG_RE, "Lowercase letters, numbers, hyphens"),
  color: z.string().regex(HEX_RE, "Pick a color"),
  description: z.string().max(2000).optional(),
  repoUrl: z.union([z.literal(""), z.string().url("Must be a valid URL").max(500)]).optional(),
  techStack: z.string().max(4000).optional(),
});

type FormValues = z.infer<typeof Schema>;

function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function NewProjectDialog({ open, onOpenChange }: Props): React.ReactElement {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const slugTouchedRef = useRef(false);

  const form = useForm<FormValues>({
    resolver: standardSchemaResolver(Schema),
    defaultValues: {
      name: "",
      slug: "",
      color: PRESET_COLORS[0]?.value ?? "#6366f1",
      description: "",
      repoUrl: "",
      techStack: "",
    },
  });

  const nameValue = form.watch("name");
  const colorValue = form.watch("color");

  // Auto-derive slug from name unless user has manually edited slug.
  useEffect(() => {
    if (slugTouchedRef.current) return;
    form.setValue("slug", slugify(nameValue), { shouldValidate: false });
  }, [nameValue, form]);

  // Reset state when dialog closes.
  useEffect(() => {
    if (!open) {
      form.reset();
      slugTouchedRef.current = false;
    }
  }, [open, form]);

  const onSubmit = (values: FormValues): void => {
    startTransition(async () => {
      const result = await createProject({
        name: values.name,
        slug: values.slug,
        color: values.color,
        description: values.description?.trim() ? values.description : undefined,
        repoUrl: values.repoUrl?.trim() ? values.repoUrl : undefined,
        techStack: values.techStack?.trim() ? values.techStack : undefined,
      });
      if (!result.ok) {
        if (result.error === "slug_taken") {
          form.setError("slug", { type: "server", message: "Slug already taken" });
          return;
        }
        toast.error(`Could not create project: ${result.error}`);
        return;
      }
      toast.success(`Created “${result.project.name}”`);
      onOpenChange(false);
      router.push(`/p/${result.project.slug}`);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Projects group tickets and give Claude Code context for your stack.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="np-name">Name</Label>
            <Input
              id="np-name"
              placeholder="My next big thing"
              autoFocus
              {...form.register("name")}
            />
            {form.formState.errors.name ? (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="np-slug">Slug</Label>
            <Input
              id="np-slug"
              placeholder="my-project"
              {...form.register("slug", {
                onChange: () => {
                  slugTouchedRef.current = true;
                },
              })}
            />
            <p className="text-xs text-muted-foreground">
              /p/<span className="font-mono">{form.watch("slug") || "<slug>"}</span>
            </p>
            {form.formState.errors.slug ? (
              <p className="text-xs text-destructive">{form.formState.errors.slug.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => {
                const selected = colorValue.toLowerCase() === c.value.toLowerCase();
                return (
                  <button
                    key={c.value}
                    type="button"
                    aria-label={c.label}
                    aria-pressed={selected}
                    onClick={() =>
                      form.setValue("color", c.value, { shouldValidate: true, shouldDirty: true })
                    }
                    className={cn(
                      "h-7 w-7 rounded-full transition-[box-shadow,transform] duration-[120ms] ease-out",
                      "ring-offset-2 ring-offset-background hover:scale-105",
                      selected ? "ring-2 ring-foreground" : "ring-0",
                    )}
                    style={{ backgroundColor: c.value }}
                  />
                );
              })}
            </div>
            {form.formState.errors.color ? (
              <p className="text-xs text-destructive">{form.formState.errors.color.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="np-description">Description</Label>
            <Textarea
              id="np-description"
              placeholder="Optional — what is this project about?"
              rows={3}
              {...form.register("description")}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="np-repo">Repository URL</Label>
            <Input
              id="np-repo"
              placeholder="https://github.com/you/repo"
              {...form.register("repoUrl")}
            />
            {form.formState.errors.repoUrl ? (
              <p className="text-xs text-destructive">{form.formState.errors.repoUrl.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="np-tech">Tech stack</Label>
            <p className="text-xs text-muted-foreground">
              Used by AI agents when generating tickets. Describe your stack, conventions, libraries
              to use/avoid, code style. Example: “Next.js 16 + Postgres + Prisma. Use shadcn for all
              UI. Strict TypeScript. No CSS frameworks other than Tailwind v4.”
            </p>
            <Textarea
              id="np-tech"
              placeholder="Next.js 16 + Postgres + Prisma…"
              rows={5}
              {...form.register("techStack")}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Creating…
                </>
              ) : (
                "Create project"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

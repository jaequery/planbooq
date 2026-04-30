"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { type SignInState, sendMagicLink, signInWithGitHub } from "./actions";

const initialState: SignInState = { status: "idle" };

type SignInFormProps = {
  githubEnabled: boolean;
};

export function SignInForm({ githubEnabled }: SignInFormProps): React.ReactElement {
  const [state, formAction, pending] = useActionState(sendMagicLink, initialState);

  useEffect(() => {
    if (state.status === "error" && state.message) {
      toast.error(state.message);
    }
  }, [state]);

  if (state.status === "sent") {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Check your inbox</CardTitle>
            <CardDescription>
              We sent a magic link to{" "}
              <span className="font-medium text-foreground">{state.email}</span>. Click it to sign
              in.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            In dev, check{" "}
            <a
              className="underline underline-offset-4"
              href="http://localhost:8025"
              rel="noreferrer"
              target="_blank"
            >
              Mailpit
            </a>{" "}
            to grab the link.
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in to Planbooq</CardTitle>
          <CardDescription>Enter your email and we&apos;ll send you a magic link.</CardDescription>
        </CardHeader>
        <form action={formAction}>
          <CardContent className="flex flex-col gap-3">
            <Label htmlFor="email">Email</Label>
            <Input
              autoComplete="email"
              autoFocus
              id="email"
              name="email"
              placeholder="you@example.com"
              required
              type="email"
            />
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button className="w-full" disabled={pending} type="submit">
              {pending ? "Sending..." : "Send magic link"}
            </Button>
          </CardFooter>
        </form>
        {githubEnabled ? (
          <CardFooter className="flex flex-col gap-3 pt-0">
            <div className="flex w-full items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              <span>or</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <form action={signInWithGitHub} className="w-full">
              <Button className="w-full" type="submit" variant="outline">
                <GitHubIcon />
                Continue with GitHub
              </Button>
            </form>
          </CardFooter>
        ) : null}
      </Card>
    </main>
  );
}

function GitHubIcon(): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      className="size-4"
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.575.106.785-.25.785-.555 0-.274-.01-1-.015-1.965-3.197.695-3.872-1.54-3.872-1.54-.523-1.328-1.277-1.682-1.277-1.682-1.044-.713.08-.699.08-.699 1.155.082 1.762 1.187 1.762 1.187 1.026 1.758 2.692 1.25 3.349.955.103-.744.402-1.25.732-1.538-2.553-.29-5.237-1.276-5.237-5.679 0-1.255.448-2.281 1.183-3.085-.119-.291-.513-1.46.112-3.043 0 0 .965-.31 3.165 1.178a10.95 10.95 0 0 1 5.762 0c2.198-1.488 3.162-1.178 3.162-1.178.627 1.583.232 2.752.114 3.043.737.804 1.181 1.83 1.181 3.085 0 4.414-2.689 5.385-5.251 5.671.413.355.78 1.058.78 2.133 0 1.54-.014 2.78-.014 3.158 0 .308.207.667.79.554A11.503 11.503 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

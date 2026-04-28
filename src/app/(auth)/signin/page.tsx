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

import { type SignInState, sendMagicLink } from "./actions";

const initialState: SignInState = { status: "idle" };

export default function SignInPage(): React.ReactElement {
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
          <CardFooter>
            <Button className="w-full" disabled={pending} type="submit">
              {pending ? "Sending..." : "Send magic link"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}

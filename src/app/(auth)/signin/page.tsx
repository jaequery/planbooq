import { isGitHubConfigured } from "@/server/auth";

import { SignInForm } from "./signin-form";

export default function SignInPage(): React.ReactElement {
  return <SignInForm githubEnabled={isGitHubConfigured} />;
}

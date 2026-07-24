import { registerHighlight } from "@highlight-run/next/server";

export async function register() {
  const projectId = process.env.HIGHLIGHT_PROJECT_ID;
  if (projectId) {
    registerHighlight({ projectID: projectId });
  }
}

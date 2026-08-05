import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/tool/bilancio-finder")({
  beforeLoad: () => {
    throw redirect({ to: "/tool/company-finder" });
  },
});

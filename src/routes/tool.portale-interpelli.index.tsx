import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/tool/portale-interpelli/")({
  beforeLoad: () => {
    throw redirect({ to: "/normativa/portale-interpelli" });
  },
});

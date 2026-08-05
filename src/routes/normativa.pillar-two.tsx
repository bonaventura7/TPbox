import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/normativa/pillar-two")({
  beforeLoad: () => {
    throw redirect({ to: "/attualita" });
  },
});

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/normativa/ocse")({
  beforeLoad: () => {
    throw redirect({ to: "/attualita/$area", params: { area: "ocse" } });
  },
});

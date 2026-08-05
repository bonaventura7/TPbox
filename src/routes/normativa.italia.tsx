import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/normativa/italia")({
  beforeLoad: () => {
    throw redirect({ to: "/attualita/$area", params: { area: "italia" } });
  },
});

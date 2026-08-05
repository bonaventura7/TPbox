import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/normativa/unione-europea")({
  beforeLoad: () => {
    throw redirect({ to: "/attualita/$area", params: { area: "unione-europea" } });
  },
});

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/tool/portale-interpelli/$id")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/normativa/portale-interpelli/$id", params: { id: params.id } });
  },
});

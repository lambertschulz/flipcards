import { routeTree } from "@/app/routes";
import { createHashHistory } from "@tanstack/history";
import { createRouter } from "@tanstack/react-router";

const hashHistory = createHashHistory();

export const router = createRouter({
  routeTree,
  history: hashHistory,
  defaultPreload: "intent",
});

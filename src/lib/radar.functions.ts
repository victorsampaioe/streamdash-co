import { createServerFn } from "@tanstack/react-start";

export const getRadarSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  const { getRadarSnapshotCached } = await import("./radar.server");
  return await getRadarSnapshotCached();
});

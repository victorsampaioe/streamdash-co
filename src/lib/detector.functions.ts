import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const runBlockDetector = createServerFn({ method: "POST" })
  .inputValidator((data: { host: string }) => z.object({ host: z.string().min(3).max(253) }).parse(data))
  .handler(async ({ data }) => {
    const { detectBlocks } = await import("./detector.server");
    return await detectBlocks(data.host);
  });

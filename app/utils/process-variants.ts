import db from "app/db.server";

function mapProductStatus(shopifyStatus?: string | null): "active" | "archived" {
  // You can tweak this mapping as you like
  if (shopifyStatus === "ACTIVE") return "active";
  return "archived"; // DRAFT / ARCHIVED → "archived" = not to be processed
}

export async function processVariants(url: string, shop: string) {
  console.log("JSONL data parser is running...");

  const res = await fetch(url);
  if (!res.ok || !res.body) {
    console.error("Failed to download JSONL", res.status);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // Keep a small in-memory map of productId → status
  const productStatus = new Map<string, "active" | "archived">();

  let lineCount = 0;
  let variantCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      lineCount++;

      let record: any;
      try {
        record = JSON.parse(line);
      } catch (e) {
        console.error("Failed to parse JSONL line:", line);
        continue;
      }

      const id = record.id as string | undefined;
      const parentId = record.__parentId as string | undefined;

      // 👇 Product row
      if (id && !parentId && record.status) {
        const status = mapProductStatus(record.status);
        productStatus.set(id, status);
        continue;
      }

      // 👇 Variant row (has __parentId)
      if (id && parentId) {
        const variantId = id;
        const productId = parentId;
        const status = productStatus.get(productId) ?? "active";

        console.log("Saving variant:", { variantId, productId, status });

        await db.variant.upsert({
          where: {
            shop_variantId: { shop, variantId },
          },
          update: {
            productId,
            status,
            // updatedAt is auto-handled by Prisma @updatedAt
          },
          create: {
            shop,
            productId,
            variantId,
            status,
          },
        });

        variantCount++;
      }
    }
  }

  // Handle any trailing partial line in buffer (optional safety)
  if (buffer.trim().length) {
    try {
      const record = JSON.parse(buffer);
      lineCount++;

      const id = record.id as string | undefined;
      const parentId = record.__parentId as string | undefined;

      if (id && !parentId && record.status) {
        const status = mapProductStatus(record.status);
        productStatus.set(id, status);
      } else if (id && parentId) {
        const variantId = id;
        const productId = parentId;
        const status = productStatus.get(productId) ?? "active";

        console.log("Saving variant (tail):", { variantId, productId, status });

        await db.variant.upsert({
          where: {
            shop_variantId: { shop, variantId },
          },
          update: {
            productId,
            status,
          },
          create: {
            shop,
            productId,
            variantId,
            status,
          },
        });

        variantCount++;
      }
    } catch (e) {
      console.error("Failed to parse tail buffer as JSON:", buffer);
    }
  }

  console.log(
    `Parsed ${lineCount} lines and saved ${variantCount} variants for ${shop}`,
  );
}

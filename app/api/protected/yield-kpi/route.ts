import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { extractRoleFromClaims, hasRequiredRole } from "@/lib/authz";
import type { YieldKpiItem, YieldKpiResponse } from "@/types";

const WINDOW_DAYS_QUERY = "windowDays";
const OFFSET_DAYS_QUERY = "offsetDays";

function parseWindowDays(rawValue: string | null) {
  if (!rawValue) {
    return 120;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return 120;
  }

  return Math.max(7, Math.min(Math.floor(parsed), 730));
}

function parseOffsetDays(rawValue: string | null) {
  if (!rawValue) {
    return 0;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.min(Math.floor(parsed), 3650));
}

function toFixedNumber(value: number) {
  return Number(value.toFixed(2));
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session.userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = extractRoleFromClaims(session.sessionClaims);
  if (!hasRequiredRole(role, "grow_manager")) {
    return Response.json(
      {
        error: "Forbidden",
        requiredRole: "grow_manager",
        role,
      },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const windowDays = parseWindowDays(url.searchParams.get(WINDOW_DAYS_QUERY));
  const offsetDays = parseOffsetDays(url.searchParams.get(OFFSET_DAYS_QUERY));
  const now = new Date();
  const windowEnd = new Date(now.getTime() - offsetDays * 24 * 60 * 60 * 1000);
  const windowStart = new Date(
    windowEnd.getTime() - windowDays * 24 * 60 * 60 * 1000,
  );

  const rows = await prisma.plantingBatch.findMany({
    where: {
      harvests: {
        some: {
          harvestedAt: {
            gte: windowStart,
            lt: windowEnd,
          },
        },
      },
    },
    include: {
      harvests: {
        where: {
          harvestedAt: {
            gte: windowStart,
            lt: windowEnd,
          },
        },
        orderBy: {
          harvestedAt: "asc",
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 200,
  });

  const items: YieldKpiItem[] = rows.flatMap((batch) => {
    if (batch.harvests.length === 0) {
      return [];
    }

    const firstHarvestAt = batch.harvests[0].harvestedAt;
    const lastHarvestAt = batch.harvests[batch.harvests.length - 1].harvestedAt;

    const usableWeightKg = batch.harvests.reduce(
      (sum, harvest) => sum + harvest.usableWeightKg,
      0,
    );
    const rejectWeightKg = batch.harvests.reduce(
      (sum, harvest) => sum + harvest.rejectWeightKg,
      0,
    );
    const totalWeight = usableWeightKg + rejectWeightKg;
    const rejectRatePct = totalWeight > 0 ? (rejectWeightKg / totalWeight) * 100 : 0;
    const cycleDays = Math.max(
      0,
      Math.round(
        (lastHarvestAt.getTime() - batch.plantedAt.getTime()) /
          (24 * 60 * 60 * 1000),
      ),
    );

    return [
      {
        batchId: batch.id,
        batchCode: batch.batchCode,
        cropName: batch.cropName,
        cultivar: batch.cultivar ?? undefined,
        zoneId: batch.zoneId,
        plantedAt: batch.plantedAt.toISOString(),
        firstHarvestAt: firstHarvestAt.toISOString(),
        lastHarvestAt: lastHarvestAt.toISOString(),
        cycleDays,
        usableWeightKg: toFixedNumber(usableWeightKg),
        rejectWeightKg: toFixedNumber(rejectWeightKg),
        rejectRatePct: toFixedNumber(rejectRatePct),
      },
    ];
  });

  const harvestedBatchCount = items.length;
  const totalUsableWeightKg = toFixedNumber(
    items.reduce((sum, item) => sum + item.usableWeightKg, 0),
  );
  const totalRejectWeightKg = toFixedNumber(
    items.reduce((sum, item) => sum + item.rejectWeightKg, 0),
  );
  const avgCycleDays =
    harvestedBatchCount > 0
      ? toFixedNumber(
          items.reduce((sum, item) => sum + item.cycleDays, 0) / harvestedBatchCount,
        )
      : 0;

  const totalWeight = totalUsableWeightKg + totalRejectWeightKg;
  const avgRejectRatePct =
    totalWeight > 0 ? toFixedNumber((totalRejectWeightKg / totalWeight) * 100) : 0;

  const response: YieldKpiResponse = {
    windowDays,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    generatedAt: now.toISOString(),
    summary: {
      harvestedBatchCount,
      totalUsableWeightKg,
      totalRejectWeightKg,
      avgCycleDays,
      avgRejectRatePct,
    },
    items,
  };

  return Response.json(response);
}

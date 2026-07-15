import type { CropBatchStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { HarvestRecord, PlantingBatch } from "@/types";

const BATCH_LIMIT = 500;
const HARVEST_LIMIT = 1000;

function toCropBatchStatus(status: string): CropBatchStatus {
  if (status === "planned" || status === "harvested" || status === "archived") {
    return status;
  }

  return "active";
}

function toPlantingBatch(row: {
  id: string;
  batchCode: string;
  cropCatalogId: string | null;
  cropName: string;
  cultivar: string | null;
  zoneId: string;
  plantedAt: Date;
  expectedHarvestStartAt: Date | null;
  expectedHarvestEndAt: Date | null;
  status: CropBatchStatus;
  startedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}): PlantingBatch {
  return {
    id: row.id,
    batchCode: row.batchCode,
    cropCatalogId: row.cropCatalogId ?? undefined,
    cropName: row.cropName,
    cultivar: row.cultivar ?? undefined,
    zoneId: row.zoneId,
    plantedAt: row.plantedAt.toISOString(),
    expectedHarvestStartAt: row.expectedHarvestStartAt?.toISOString(),
    expectedHarvestEndAt: row.expectedHarvestEndAt?.toISOString(),
    status: row.status,
    startedByUserId: row.startedByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toHarvestRecord(row: {
  id: string;
  batchId: string;
  zoneId: string;
  harvestedAt: Date;
  operatorUserId: string;
  usableWeightKg: number;
  rejectWeightKg: number;
  wetWeightKg: number | null;
  dryWeightKg: number | null;
  qualityGrade: "A" | "B" | "C" | "reject" | null;
  defectNotes: string | null;
  finalized: boolean;
  finalizedAt: Date | null;
  notes: string | null;
  createdAt: Date;
}): HarvestRecord {
  return {
    id: row.id,
    batchId: row.batchId,
    zoneId: row.zoneId,
    harvestedAt: row.harvestedAt.toISOString(),
    operatorUserId: row.operatorUserId,
    usableWeightKg: row.usableWeightKg,
    rejectWeightKg: row.rejectWeightKg,
    wetWeightKg: row.wetWeightKg ?? undefined,
    dryWeightKg: row.dryWeightKg ?? undefined,
    qualityGrade: row.qualityGrade ?? undefined,
    defectNotes: row.defectNotes ?? undefined,
    finalized: row.finalized,
    finalizedAt: row.finalizedAt?.toISOString(),
    notes: row.notes ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function addPlantingBatch(batch: PlantingBatch) {
  await prisma.plantingBatch.create({
    data: {
      id: batch.id,
      batchCode: batch.batchCode,
      cropCatalogId: batch.cropCatalogId,
      cropName: batch.cropName,
      cultivar: batch.cultivar,
      zoneId: batch.zoneId,
      plantedAt: new Date(batch.plantedAt),
      expectedHarvestStartAt: batch.expectedHarvestStartAt
        ? new Date(batch.expectedHarvestStartAt)
        : null,
      expectedHarvestEndAt: batch.expectedHarvestEndAt
        ? new Date(batch.expectedHarvestEndAt)
        : null,
      status: toCropBatchStatus(batch.status),
      startedByUserId: batch.startedByUserId,
      createdAt: new Date(batch.createdAt),
      updatedAt: new Date(batch.updatedAt),
      zoneAssignments: {
        create: {
          id: crypto.randomUUID(),
          zoneId: batch.zoneId,
          assignedAt: new Date(batch.plantedAt),
          assignmentReason: "initial-planting-zone",
          createdAt: new Date(batch.createdAt),
        },
      },
    },
  });

  return batch;
}

export async function listPlantingBatches(limit = 100) {
  const safeLimit = Math.max(1, Math.min(limit, BATCH_LIMIT));
  const rows = await prisma.plantingBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: safeLimit,
  });
  return rows.map((row) => toPlantingBatch(row));
}

export async function getPlantingBatchById(batchId: string) {
  const row = await prisma.plantingBatch.findUnique({
    where: { id: batchId },
  });
  return row ? toPlantingBatch(row) : undefined;
}

export async function getPlantingBatchByCode(batchCode: string) {
  const row = await prisma.plantingBatch.findUnique({
    where: { batchCode },
  });
  return row ? toPlantingBatch(row) : undefined;
}

export async function markBatchHarvested(batchId: string) {
  const existing = await prisma.plantingBatch.findUnique({
    where: { id: batchId },
  });

  if (!existing) {
    return null;
  }

  const updated = await prisma.plantingBatch.update({
    where: { id: batchId },
    data: {
      status: "harvested",
      updatedAt: new Date(),
    },
  });

  return toPlantingBatch(updated);
}

export async function addHarvestRecord(record: HarvestRecord) {
  await prisma.harvestRecord.create({
    data: {
      id: record.id,
      batchId: record.batchId,
      zoneId: record.zoneId,
      harvestedAt: new Date(record.harvestedAt),
      operatorUserId: record.operatorUserId,
      usableWeightKg: record.usableWeightKg,
      rejectWeightKg: record.rejectWeightKg,
      wetWeightKg: record.wetWeightKg,
      dryWeightKg: record.dryWeightKg,
      qualityGrade: record.qualityGrade,
      defectNotes: record.defectNotes,
      finalized: record.finalized,
      finalizedAt: record.finalizedAt ? new Date(record.finalizedAt) : null,
      notes: record.notes,
      createdAt: new Date(record.createdAt),
    },
  });

  return record;
}

export async function listHarvestRecords(limit = 100) {
  const safeLimit = Math.max(1, Math.min(limit, HARVEST_LIMIT));
  const rows = await prisma.harvestRecord.findMany({
    orderBy: { createdAt: "desc" },
    take: safeLimit,
  });
  return rows.map((row) => toHarvestRecord(row));
}

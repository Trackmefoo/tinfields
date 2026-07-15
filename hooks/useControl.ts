"use client";

import { useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import { publishTopic } from "@/lib/mqtt";
import type { ActuatorCommand } from "@/types";

function publishCommand(command: ActuatorCommand) {
  const controlTopic = process.env.NEXT_PUBLIC_MQTT_CONTROL_TOPIC;
  if (!controlTopic) {
    return;
  }

  publishTopic(controlTopic, JSON.stringify(command));
}

type CommandQueueResponse = {
  ok?: boolean;
  shouldPublish?: boolean;
  error?: string;
  validationMessage?: string;
};

const DEFAULT_FARM_ID = process.env.NEXT_PUBLIC_FARM_ID ?? "demo-farm";

async function queueCommand(command: ActuatorCommand & { action: string }) {
  const response = await fetch("/api/protected/commands", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      farmId: command.farmId ?? DEFAULT_FARM_ID,
      zoneId: command.zone,
      actuatorId: command.deviceId,
      source: command.source ?? "manual",
      action: command.action,
      command: command.command,
      payload: command.payload,
      safetyContext: {
        manualOverrideLocked: false,
      },
    }),
    credentials: "include",
  });

  const payload: CommandQueueResponse = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Unable to queue command.");
  }

  return payload;
}

export function useControl() {
  const { userId } = useAuth();

  return useMemo(
    () => ({
      toggleLights: async () => {
        const command: ActuatorCommand & { action: string } = {
          deviceId: "lights-main",
          command: "pulse",
          action: "toggle-lights",
          actorUserId: userId ?? undefined,
          source: "manual",
        };

        const result = await queueCommand(command);
        if (result.shouldPublish) {
          publishCommand(command);
        }
      },
      startIrrigationZoneA: async () => {
        const command: ActuatorCommand & { action: string } = {
          deviceId: "irrigation-a",
          command: "pulse",
          action: "start-irrigation-zone-a",
          zone: "A",
          payload: { seconds: 20 },
          actorUserId: userId ?? undefined,
          source: "manual",
        };

        const result = await queueCommand(command);
        if (result.shouldPublish) {
          publishCommand(command);
        }
      },
      ventilationBoost: async () => {
        const command: ActuatorCommand & { action: string } = {
          deviceId: "ventilation-main",
          command: "pulse",
          action: "ventilation-boost",
          payload: { level: "boost", seconds: 30 },
          actorUserId: userId ?? undefined,
          source: "manual",
        };

        const result = await queueCommand(command);
        if (result.shouldPublish) {
          publishCommand(command);
        }
      },
    }),
    [userId],
  );
}

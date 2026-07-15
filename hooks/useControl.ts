"use client";

import { useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import { publishTopic } from "@/lib/mqtt";
import type { ActuatorCommand, AuditEventPayload } from "@/types";

function publishCommand(command: ActuatorCommand) {
  const controlTopic = process.env.NEXT_PUBLIC_MQTT_CONTROL_TOPIC;
  if (!controlTopic) {
    return;
  }

  publishTopic(controlTopic, JSON.stringify(command));
}

async function logAuditEvent(event: AuditEventPayload) {
  try {
    await fetch("/api/protected/audit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
      credentials: "include",
    });
  } catch {
    // Best-effort client logging path. Core command execution should continue.
  }
}

export function useControl() {
  const { userId } = useAuth();

  return useMemo(
    () => ({
      toggleLights: async () => {
        await logAuditEvent({
          eventType: "command",
          action: "toggle-lights",
          targetType: "actuator",
          targetId: "lights-main",
        });

        publishCommand({
          deviceId: "lights-main",
          command: "pulse",
          actorUserId: userId ?? undefined,
        });
      },
      startIrrigationZoneA: async () => {
        await logAuditEvent({
          eventType: "command",
          action: "start-irrigation-zone-a",
          targetType: "actuator",
          targetId: "irrigation-a",
          details: { zone: "A", seconds: 20 },
        });

        publishCommand({
          deviceId: "irrigation-a",
          command: "pulse",
          zone: "A",
          payload: { seconds: 20 },
          actorUserId: userId ?? undefined,
        });
      },
      ventilationBoost: async () => {
        await logAuditEvent({
          eventType: "command",
          action: "ventilation-boost",
          targetType: "actuator",
          targetId: "ventilation-main",
          details: { level: "boost", seconds: 30 },
        });

        publishCommand({
          deviceId: "ventilation-main",
          command: "pulse",
          payload: { level: "boost", seconds: 30 },
          actorUserId: userId ?? undefined,
        });
      },
    }),
    [userId],
  );
}

"use client";

import { useMemo } from "react";
import { publishTopic } from "@/lib/mqtt";
import type { ActuatorCommand } from "@/types";

function publishCommand(command: ActuatorCommand) {
  const controlTopic = process.env.NEXT_PUBLIC_MQTT_CONTROL_TOPIC;
  if (!controlTopic) {
    return;
  }

  publishTopic(controlTopic, JSON.stringify(command));
}

export function useControl() {
  return useMemo(
    () => ({
      toggleLights: () =>
        publishCommand({
          deviceId: "lights-main",
          command: "pulse",
        }),
      startIrrigationZoneA: () =>
        publishCommand({
          deviceId: "irrigation-a",
          command: "pulse",
          zone: "A",
          payload: { seconds: 20 },
        }),
      ventilationBoost: () =>
        publishCommand({
          deviceId: "ventilation-main",
          command: "pulse",
          payload: { level: "boost", seconds: 30 },
        }),
    }),
    [],
  );
}

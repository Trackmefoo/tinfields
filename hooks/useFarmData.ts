"use client";

import { useEffect, useMemo, useState } from "react";
import { connectMqtt, disconnectMqtt, subscribeTopic } from "@/lib/mqtt";
import type { SensorData, SensorHistoryPoint, SensorType } from "@/types";

const SENSOR_TYPES: SensorType[] = ["temperature", "humidity", "soilMoisture", "ph"];
const HISTORY_LIMIT = 24;

function isSensorType(value: string): value is SensorType {
  return SENSOR_TYPES.includes(value as SensorType);
}

function timeLabel(timestampIso: string) {
  const d = new Date(timestampIso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function toHistoryPoint(data: Record<SensorType, SensorData>): SensorHistoryPoint {
  return {
    time: timeLabel(data.temperature.timestamp),
    temperature: Number(data.temperature.value.toFixed(2)),
    humidity: Number(data.humidity.value.toFixed(2)),
    soilMoisture: Number(data.soilMoisture.value.toFixed(2)),
    ph: Number(data.ph.value.toFixed(2)),
  };
}

function appendHistory(
  prev: SensorHistoryPoint[],
  nextSensors: Record<SensorType, SensorData>,
) {
  const next = [...prev, toHistoryPoint(nextSensors)];
  if (next.length > HISTORY_LIMIT) {
    return next.slice(next.length - HISTORY_LIMIT);
  }
  return next;
}

function makeMockSensor(sensorType: SensorType, value: number, unit: string): SensorData {
  return {
    id: sensorType,
    sensorType,
    value,
    unit,
    timestamp: new Date().toISOString(),
  };
}

export function useFarmData() {
  const [isMqttConnected, setIsMqttConnected] = useState(false);
  const initialSensors: Record<SensorType, SensorData> = {
    temperature: makeMockSensor("temperature", 24.6, "C"),
    humidity: makeMockSensor("humidity", 61, "%"),
    soilMoisture: makeMockSensor("soilMoisture", 43, "%"),
    ph: makeMockSensor("ph", 6.7, "pH"),
  };

  const [sensors, setSensors] = useState<Record<SensorType, SensorData>>(initialSensors);
  const [sensorHistory, setSensorHistory] = useState<SensorHistoryPoint[]>([
    toHistoryPoint(initialSensors),
  ]);

  const brokerUrl = process.env.NEXT_PUBLIC_MQTT_BROKER_URL;
  const sensorTopic = process.env.NEXT_PUBLIC_MQTT_SENSOR_TOPIC;

  useEffect(() => {
    const mockTicker = window.setInterval(() => {
      setSensors((prev) => {
        const nextSensors = {
          ...prev,
          temperature: makeMockSensor("temperature", Math.max(18, prev.temperature.value + (Math.random() - 0.5) * 0.6), "C"),
          humidity: makeMockSensor("humidity", Math.min(100, Math.max(25, prev.humidity.value + (Math.random() - 0.5) * 1.8)), "%"),
          soilMoisture: makeMockSensor("soilMoisture", Math.min(100, Math.max(10, prev.soilMoisture.value + (Math.random() - 0.5) * 1.2)), "%"),
          ph: makeMockSensor("ph", Math.min(8.5, Math.max(5.0, prev.ph.value + (Math.random() - 0.5) * 0.05)), "pH"),
        };
        setSensorHistory((prevHistory) => appendHistory(prevHistory, nextSensors));
        return nextSensors;
      });
    }, 5000);

    if (!brokerUrl || !sensorTopic) {
      return () => window.clearInterval(mockTicker);
    }

    const client = connectMqtt(brokerUrl, {
      clientId: `${process.env.NEXT_PUBLIC_MQTT_CLIENT_PREFIX ?? "tinfields"}-${Math.random().toString(16).slice(2, 8)}`,
      username: process.env.NEXT_PUBLIC_MQTT_USERNAME,
      password: process.env.NEXT_PUBLIC_MQTT_PASSWORD,
    });

    if (!client) {
      return () => window.clearInterval(mockTicker);
    }

    const onConnect = () => {
      setIsMqttConnected(true);
      const unsubscribe = subscribeTopic(sensorTopic, (payload) => {
        try {
          const parsed = JSON.parse(payload) as Partial<SensorData>;
          if (
            parsed.sensorType &&
            isSensorType(parsed.sensorType) &&
            typeof parsed.value === "number"
          ) {
            const sensorType = parsed.sensorType;
            const sensorValue = parsed.value;
            setSensors((prev) => {
              const nextSensor: SensorData = {
                id: parsed.id ?? prev[sensorType].id,
                sensorType,
                value: sensorValue,
                unit: parsed.unit ?? prev[sensorType].unit,
                timestamp: parsed.timestamp ?? new Date().toISOString(),
              };
              const nextSensors = { ...prev, [sensorType]: nextSensor };
              setSensorHistory((prevHistory) => appendHistory(prevHistory, nextSensors));
              return nextSensors;
            });
          }
        } catch {
          // Ignore malformed telemetry payloads and keep last known values.
        }
      });

      client.once("close", unsubscribe);
    };

    const onClose = () => setIsMqttConnected(false);

    client.on("connect", onConnect);
    client.on("close", onClose);

    return () => {
      window.clearInterval(mockTicker);
      client.off("connect", onConnect);
      client.off("close", onClose);
      disconnectMqtt();
    };
  }, [brokerUrl, sensorTopic]);

  return useMemo(
    () => ({
      isMqttConnected,
      sensors,
      sensorHistory,
    }),
    [isMqttConnected, sensorHistory, sensors],
  );
}

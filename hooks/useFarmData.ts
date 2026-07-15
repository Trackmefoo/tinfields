"use client";

import { useEffect, useMemo, useState } from "react";
import { connectMqtt, disconnectMqtt, subscribeTopic } from "@/lib/mqtt";
import type { SensorData, SensorType } from "@/types";

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
  const [sensors, setSensors] = useState<Record<SensorType, SensorData>>({
    temperature: makeMockSensor("temperature", 24.6, "C"),
    humidity: makeMockSensor("humidity", 61, "%"),
    soilMoisture: makeMockSensor("soilMoisture", 43, "%"),
    ph: makeMockSensor("ph", 6.7, "pH"),
  });

  const brokerUrl = process.env.NEXT_PUBLIC_MQTT_BROKER_URL;
  const sensorTopic = process.env.NEXT_PUBLIC_MQTT_SENSOR_TOPIC;

  useEffect(() => {
    const mockTicker = window.setInterval(() => {
      setSensors((prev) => ({
        ...prev,
        temperature: makeMockSensor("temperature", Math.max(18, prev.temperature.value + (Math.random() - 0.5) * 0.6), "C"),
        humidity: makeMockSensor("humidity", Math.min(100, Math.max(25, prev.humidity.value + (Math.random() - 0.5) * 1.8)), "%"),
        soilMoisture: makeMockSensor("soilMoisture", Math.min(100, Math.max(10, prev.soilMoisture.value + (Math.random() - 0.5) * 1.2)), "%"),
        ph: makeMockSensor("ph", Math.min(8.5, Math.max(5.0, prev.ph.value + (Math.random() - 0.5) * 0.05)), "pH"),
      }));
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
      subscribeTopic(sensorTopic, (payload) => {
        try {
          const parsed = JSON.parse(payload) as SensorData;
          if (parsed.sensorType) {
            setSensors((prev) => ({ ...prev, [parsed.sensorType]: parsed }));
          }
        } catch {
          // Ignore malformed telemetry payloads and keep last known values.
        }
      });
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
    }),
    [isMqttConnected, sensors],
  );
}

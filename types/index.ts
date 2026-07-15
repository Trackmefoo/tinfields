export type SensorType = "temperature" | "humidity" | "soilMoisture" | "ph";

export interface SensorData {
  id: string;
  sensorType: SensorType;
  value: number;
  unit: string;
  timestamp: string;
}

export interface SensorHistoryPoint {
  time: string;
  temperature: number;
  humidity: number;
  soilMoisture: number;
  ph: number;
}

export interface CropRecipe {
  id: string;
  cropName: string;
  targetTemperatureC: number;
  targetHumidityPercent: number;
  irrigationPerDayMl: number;
  photoperiodHours: number;
}

export interface ActuatorCommand {
  deviceId: string;
  command: "on" | "off" | "pulse";
  zone?: string;
  payload?: Record<string, unknown>;
}

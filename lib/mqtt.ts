import { connect, type IClientOptions, type MqttClient } from "mqtt";

let client: MqttClient | null = null;

export function getMqttClient() {
  return client;
}

export function connectMqtt(brokerUrl: string, options?: IClientOptions) {
  if (typeof window === "undefined") {
    return null;
  }

  if (client?.connected) {
    return client;
  }

  client = connect(brokerUrl, options);
  return client;
}

export function subscribeTopic(
  topic: string,
  onMessage: (payload: string) => void,
) {
  if (!client) {
    throw new Error("MQTT client is not connected.");
  }

  client.subscribe(topic);
  client.on("message", (incomingTopic, message) => {
    if (incomingTopic === topic) {
      onMessage(message.toString());
    }
  });
}

export function publishTopic(topic: string, payload: string) {
  if (!client) {
    throw new Error("MQTT client is not connected.");
  }

  client.publish(topic, payload);
}

export function disconnectMqtt() {
  if (client) {
    client.end();
    client = null;
  }
}

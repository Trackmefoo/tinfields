import mqtt, { type IClientOptions, type MqttClient } from "mqtt";

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

  client = mqtt.connect(brokerUrl, options);
  return client;
}

export function subscribeTopic(
  topic: string,
  onMessage: (payload: string) => void,
) {
  if (!client || !client.connected) {
    return () => {};
  }

  client.subscribe(topic);
  const listener = (incomingTopic: string, message: Uint8Array) => {
    if (incomingTopic === topic) {
      onMessage(message.toString());
    }
  };

  client.on("message", listener);

  return () => {
    if (!client) {
      return;
    }

    client.off("message", listener);
    client.unsubscribe(topic);
  };
}

export function publishTopic(topic: string, payload: string) {
  if (!client || !client.connected) {
    return false;
  }

  client.publish(topic, payload);
  return true;
}

export function disconnectMqtt() {
  if (client) {
    client.end();
    client = null;
  }
}

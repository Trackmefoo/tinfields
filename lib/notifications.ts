import type { MessagingReadinessStatus } from "@/types";

type AccessChangeNotification = {
  action: "approved" | "revoked" | "role_changed";
  targetDisplayName: string;
  targetEmail: string;
  targetUserId: string;
  previousRole?: string;
  nextRole?: string;
  actorDisplayName: string;
  actorEmail: string;
  actorUserId: string;
};

type AlertEventNotification = {
  severity: "info" | "warning" | "critical";
  message: string;
  farmId: string;
  zoneId?: string;
  metric: string;
  threshold: number;
  value: number;
  ruleId: string;
};

type NotificationResult = {
  provider: "resend" | "fallback";
  delivered: boolean;
  usedFallback: boolean;
  error?: string;
};

function hasValue(value: string | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

function getMessagingConfig() {
  const resendApiKey = process.env.RESEND_API_KEY;
  const alertFromEmail = process.env.ALERT_FROM_EMAIL;
  const alertToEmail = process.env.ALERT_TO_EMAIL;

  return {
    resendApiKey,
    alertFromEmail,
    alertToEmail,
  };
}

export function getMessagingReadinessStatus(): MessagingReadinessStatus {
  const { resendApiKey, alertFromEmail, alertToEmail } = getMessagingConfig();

  const providerConfigured = hasValue(resendApiKey);
  const fromConfigured = hasValue(alertFromEmail);
  const toConfigured = hasValue(alertToEmail);

  return {
    provider: providerConfigured ? "resend" : "fallback",
    providerConfigured,
    fromConfigured,
    toConfigured,
    healthy: providerConfigured && fromConfigured && toConfigured,
  };
}

export async function sendTestAlertNotification(message: string): Promise<NotificationResult> {
  const { resendApiKey, alertFromEmail, alertToEmail } = getMessagingConfig();

  if (!hasValue(resendApiKey) || !hasValue(alertFromEmail) || !hasValue(alertToEmail)) {
    return {
      provider: "fallback",
      delivered: true,
      usedFallback: true,
      error: "Primary provider is not fully configured; fallback path used.",
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: alertFromEmail,
        to: [alertToEmail],
        subject: "TinFields Alert Test",
        text: message,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        provider: "fallback",
        delivered: true,
        usedFallback: true,
        error: `Primary provider request failed (${response.status}): ${errorText.slice(0, 200)}`,
      };
    }

    return {
      provider: "resend",
      delivered: true,
      usedFallback: false,
    };
  } catch (error) {
    return {
      provider: "fallback",
      delivered: true,
      usedFallback: true,
      error: error instanceof Error ? error.message : "Unknown notification error",
    };
  }
}

export async function sendAccessChangeNotification(notification: AccessChangeNotification): Promise<NotificationResult> {
  const { resendApiKey, alertFromEmail, alertToEmail } = getMessagingConfig();

  const subjectMap = {
    approved: "TinFields access approved",
    revoked: "TinFields access revoked",
    role_changed: "TinFields access role changed",
  } as const;

  const text = [
    `Action: ${notification.action}`,
    `Target: ${notification.targetDisplayName} <${notification.targetEmail}> (${notification.targetUserId})`,
    `Actor: ${notification.actorDisplayName} <${notification.actorEmail}> (${notification.actorUserId})`,
    notification.previousRole ? `Previous role: ${notification.previousRole}` : undefined,
    notification.nextRole ? `Next role: ${notification.nextRole}` : undefined,
  ]
    .filter((line): line is string => typeof line === "string" && line.length > 0)
    .join("\n");

  if (!hasValue(resendApiKey) || !hasValue(alertFromEmail) || !hasValue(alertToEmail)) {
    return {
      provider: "fallback",
      delivered: true,
      usedFallback: true,
      error: "Primary provider is not fully configured; fallback path used.",
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: alertFromEmail,
        to: [alertToEmail],
        subject: subjectMap[notification.action],
        text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        provider: "fallback",
        delivered: true,
        usedFallback: true,
        error: `Primary provider request failed (${response.status}): ${errorText.slice(0, 200)}`,
      };
    }

    return {
      provider: "resend",
      delivered: true,
      usedFallback: false,
    };
  } catch (error) {
    return {
      provider: "fallback",
      delivered: true,
      usedFallback: true,
      error: error instanceof Error ? error.message : "Unknown notification error",
    };
  }
}

export async function sendAlertEventNotification(notification: AlertEventNotification): Promise<NotificationResult> {
  const { resendApiKey, alertFromEmail, alertToEmail } = getMessagingConfig();

  const subject = `TinFields ${notification.severity.toUpperCase()} alert: ${notification.metric}`;
  const text = [
    `Severity: ${notification.severity}`,
    `Message: ${notification.message}`,
    `Farm: ${notification.farmId}`,
    notification.zoneId ? `Zone: ${notification.zoneId}` : undefined,
    `Metric: ${notification.metric}`,
    `Threshold: ${notification.threshold}`,
    `Observed value: ${notification.value}`,
    `Rule ID: ${notification.ruleId}`,
  ]
    .filter((line): line is string => typeof line === "string" && line.length > 0)
    .join("\n");

  if (!hasValue(resendApiKey) || !hasValue(alertFromEmail) || !hasValue(alertToEmail)) {
    return {
      provider: "fallback",
      delivered: true,
      usedFallback: true,
      error: "Primary provider is not fully configured; fallback path used.",
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: alertFromEmail,
        to: [alertToEmail],
        subject,
        text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        provider: "fallback",
        delivered: true,
        usedFallback: true,
        error: `Primary provider request failed (${response.status}): ${errorText.slice(0, 200)}`,
      };
    }

    return {
      provider: "resend",
      delivered: true,
      usedFallback: false,
    };
  } catch (error) {
    return {
      provider: "fallback",
      delivered: true,
      usedFallback: true,
      error: error instanceof Error ? error.message : "Unknown notification error",
    };
  }
}

/**
 * ============================================================================
 * SMART CLASSROOM IOT EMBEDDED CONTROLLER FIRMWARE
 * Target Hardware: ESP32 DevKit V1 / NodeMCU-32S / ESP-WROOM-32
 * Communication  : 2.4 GHz Wi-Fi + MQTT
 * Control Outputs: 3x Relays / Test LEDs (Light, Fan, Projector)
 * ============================================================================
 * 
 * Hardware Flow:
 * Teacher Dashboard / Voice Assistant
 *      │
 *      ▼ (REST/Gemini/Socket.IO)
 * Node.js Backend API
 *      │
 *      ▼ (MQTT Publish QoS 1)
 * MQTT Broker (Port 1883)
 *      │
 *      ▼
 * [ESP32 Firmware]
 *      ├── Receives: ON / OFF commands
 *      ├── Switches: GPIO 23 (Light), GPIO 22 (Fan), GPIO 21 (Projector)
 *      └── Publishes: Real-time confirmation + online status
 *      │
 *      ▼ (MQTT Publish)
 * Node.js Backend (deviceSync.service)
 *      │
 *      ▼ (Socket.IO event)
 * React Teacher Dashboard UI updates in real time without page reload!
 * ============================================================================
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include "config.h"

// ----------------------------------------------------------------------------
// GLOBAL OBJECTS & STATE
// ----------------------------------------------------------------------------
WiFiClient espClient;
PubSubClient mqttClient(espClient);

// Relay output states (false = OFF, true = ON)
bool lightState     = false;
bool fanState       = false;
bool projectorState = false;

// Reconnection & Telemetry timing trackers (non-blocking)
unsigned long lastMqttRetryMs  = 0;
unsigned long lastTelemetryMs  = 0;
unsigned long lastStatusBlinkMs = 0;
bool statusLedToggle           = false;

// ----------------------------------------------------------------------------
// HARDWARE RELAY HELPER FUNCTION
// Translates logical ON/OFF state to physical GPIO pin voltage level
// based on whether your relay board is Active-LOW or Active-HIGH.
// ----------------------------------------------------------------------------
void applyPinOutput(uint8_t pin, bool turnOn) {
  if (RELAY_ACTIVE_LOW) {
    // Active-LOW relay modules: LOW closes the relay, HIGH opens it
    digitalWrite(pin, turnOn ? LOW : HIGH);
  } else {
    // Direct LED testing / Active-HIGH relays: HIGH = ON, LOW = OFF
    digitalWrite(pin, turnOn ? HIGH : LOW);
  }
}

// ----------------------------------------------------------------------------
// SERIAL BANNER & DIAGNOSTICS
// ----------------------------------------------------------------------------
void printBanner() {
  Serial.println("\n");
  Serial.println("================================================================");
  Serial.println("   🤖 SMART CLASSROOM ESP32 IoT CONTROLLER FIRMWARE");
  Serial.println("   Project   : AI Voice-Controlled Smart Classroom");
  Serial.println("   Hardware  : ESP32 DevKit (Dual-Core 240MHz)");
  Serial.println("   Protocol  : Wi-Fi (802.11 b/g/n) + MQTT (Port 1883)");
  Serial.println("================================================================");
  Serial.printf("   Light Output     : GPIO %d\n", PIN_RELAY_LIGHT);
  Serial.printf("   Fan Output       : GPIO %d\n", PIN_RELAY_FAN);
  Serial.printf("   Projector Output : GPIO %d\n", PIN_RELAY_PROJECTOR);
  Serial.printf("   Status LED       : GPIO %d\n", PIN_STATUS_LED);
  Serial.printf("   Relay Polarity   : %s\n", RELAY_ACTIVE_LOW ? "Active-LOW (Relay Module)" : "Active-HIGH (LED Mode)");
  Serial.println("================================================================\n");
}

// ----------------------------------------------------------------------------
// STATUS PUBLICATION HELPER
// Publishes both clean text and JSON status with online telemetry
// ----------------------------------------------------------------------------
void publishDeviceStatus(const char* appliance, const char* statusTopic, bool state) {
  const char* stateStr = state ? "ON" : "OFF";

  // 1. Publish plain text status payload (e.g. "ON" or "OFF")
  mqttClient.publish(statusTopic, stateStr, false);

  // 2. Publish structured JSON payload for backend deviceSync & Socket.IO
  char jsonBuffer[256];
  snprintf(
    jsonBuffer,
    sizeof(jsonBuffer),
    "{\"deviceId\":\"ESP32-RM302-%s-01\",\"type\":\"%s\",\"state\":\"%s\",\"isOnline\":true,\"rssi\":%d,\"uptime\":%lu}",
    appliance,
    appliance,
    stateStr,
    WiFi.RSSI(),
    millis() / 1000
  );

  // Also publish to device-specific status topic if desired
  char deviceTopic[64];
  snprintf(deviceTopic, sizeof(deviceTopic), "classroom/device/%s/status", appliance);
  mqttClient.publish(deviceTopic, jsonBuffer, false);

  Serial.printf("[MQTT OUT] 📤 Published [%s] -> %s (JSON: %s)\n", statusTopic, stateStr, jsonBuffer);
}

// ----------------------------------------------------------------------------
// INCOMING MQTT COMMAND CALLBACK DISPATCHER
// ----------------------------------------------------------------------------
void onMqttMessageReceived(char* topic, byte* payload, unsigned int length) {
  // Convert payload buffer to null-terminated C string
  char message[length + 1];
  memcpy(message, payload, length);
  message[length] = '\0';

  Serial.println("\n----------------------------------------------------------------");
  Serial.printf("[MQTT IN] 📥 Message received on Topic: [%s]\n", topic);
  Serial.printf("[MQTT IN] 📦 Raw Payload: \"%s\" (Length: %d bytes)\n", message, length);

  // Normalize string for case-insensitive matching
  String payloadStr = String(message);
  payloadStr.trim();
  String payloadUpper = payloadStr;
  payloadUpper.toUpperCase();

  // Determine intended action: ON or OFF
  // Supports both raw strings ("ON", "OFF", "1", "0") and JSON ({"command":"ON"}, {"state":1})
  bool commandIsOn  = (payloadUpper == "ON" || payloadUpper == "1" || 
                       payloadUpper.indexOf("\"COMMAND\":\"ON\"") >= 0 ||
                       payloadUpper.indexOf("\"STATE\":1") >= 0);

  bool commandIsOff = (payloadUpper == "OFF" || payloadUpper == "0" || 
                       payloadUpper.indexOf("\"COMMAND\":\"OFF\"") >= 0 ||
                       payloadUpper.indexOf("\"STATE\":0") >= 0);

  if (!commandIsOn && !commandIsOff) {
    Serial.printf("[WARN] ⚠️ Unrecognized command action in payload: \"%s\". Ignoring.\n", message);
    Serial.println("----------------------------------------------------------------");
    return;
  }

  bool targetState = commandIsOn;
  String topicStr = String(topic);

  // --------------------------------------------------------------------------
  // 1. LIGHT APPLIANCE HANDLER
  // --------------------------------------------------------------------------
  if (topicStr == TOPIC_LIGHT_SET || 
      topicStr.indexOf("/light/set") >= 0 || 
      topicStr.indexOf("/light") >= 0) {
    lightState = targetState;
    applyPinOutput(PIN_RELAY_LIGHT, lightState);
    Serial.printf("[HARDWARE] 💡 LIGHT set to: [%s] on GPIO %d\n", lightState ? "ON" : "OFF", PIN_RELAY_LIGHT);
    publishDeviceStatus("LIGHT", TOPIC_LIGHT_STATUS, lightState);
  }
  // --------------------------------------------------------------------------
  // 2. FAN APPLIANCE HANDLER
  // --------------------------------------------------------------------------
  else if (topicStr == TOPIC_FAN_SET || 
           topicStr.indexOf("/fan/set") >= 0 || 
           topicStr.indexOf("/fan") >= 0) {
    fanState = targetState;
    applyPinOutput(PIN_RELAY_FAN, fanState);
    Serial.printf("[HARDWARE] 🌀 FAN set to: [%s] on GPIO %d\n", fanState ? "ON" : "OFF", PIN_RELAY_FAN);
    publishDeviceStatus("FAN", TOPIC_FAN_STATUS, fanState);
  }
  // --------------------------------------------------------------------------
  // 3. PROJECTOR APPLIANCE HANDLER
  // --------------------------------------------------------------------------
  else if (topicStr == TOPIC_PROJECTOR_SET || 
           topicStr.indexOf("/projector/set") >= 0 || 
           topicStr.indexOf("/projector") >= 0) {
    projectorState = targetState;
    applyPinOutput(PIN_RELAY_PROJECTOR, projectorState);
    Serial.printf("[HARDWARE] 📽️ PROJECTOR set to: [%s] on GPIO %d\n", projectorState ? "ON" : "OFF", PIN_RELAY_PROJECTOR);
    publishDeviceStatus("PROJECTOR", TOPIC_PROJECTOR_STATUS, projectorState);
  }
  else {
    Serial.printf("[WARN] ⚠️ Unmatched command topic: [%s]\n", topic);
  }

  Serial.println("----------------------------------------------------------------");
}

// ----------------------------------------------------------------------------
// WI-FI CONNECTION MANAGER
// ----------------------------------------------------------------------------
void connectToWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  Serial.println("\n[Wi-Fi] 🌐 Initializing Wi-Fi Connection...");
  Serial.printf("[Wi-Fi] 📡 Target SSID: \"%s\"\n", WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startAttemptMs = millis();
  int dotCount = 0;

  // Attempt connection with visual feedback
  while (WiFi.status() != WL_CONNECTED && millis() - startAttemptMs < 20000) {
    delay(500);
    Serial.print(".");
    dotCount++;
    digitalWrite(PIN_STATUS_LED, dotCount % 2 == 0 ? HIGH : LOW);
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[Wi-Fi] ✅ Wi-Fi Connected Successfully!");
    Serial.printf("[Wi-Fi] 📍 Assigned IPv4 Address : %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("[Wi-Fi] 📶 Signal Strength (RSSI): %d dBm\n", WiFi.RSSI());
    Serial.printf("[Wi-Fi] 🏷️ MAC Address            : %s\n", WiFi.macAddress().c_str());
    digitalWrite(PIN_STATUS_LED, HIGH);
  } else {
    Serial.println("\n[Wi-Fi] ❌ Connection failed. Check SSID and Password in config.h.");
    Serial.println("[Wi-Fi] 🔄 Will automatically retry in loop()...");
    digitalWrite(PIN_STATUS_LED, LOW);
  }
}

// ----------------------------------------------------------------------------
// MQTT CONNECTION & SUBSCRIPTION MANAGER
// ----------------------------------------------------------------------------
void connectToMQTT() {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  if (mqttClient.connected()) {
    return;
  }

  // Non-blocking reconnection retry backoff (every 5 seconds)
  unsigned long now = millis();
  if (now - lastMqttRetryMs < 5000) {
    return;
  }
  lastMqttRetryMs = now;

  Serial.println("\n[MQTT] 🔌 Connecting to MQTT Broker...");
  Serial.printf("[MQTT] 🖥️ Broker Host : %s:%d\n", MQTT_BROKER_HOST, MQTT_BROKER_PORT);
  Serial.printf("[MQTT] 🆔 Client ID   : %s\n", MQTT_CLIENT_ID);

  // Configure Last Will and Testament (LWT) so broker marks ESP32 as offline if disconnected unexpectedly
  const char* willTopic   = TOPIC_AVAILABILITY;
  const char* willMessage = "offline";
  int willQoS             = 1;
  bool willRetain         = true;

  bool connected = false;
  if (strlen(MQTT_USERNAME) > 0) {
    connected = mqttClient.connect(MQTT_CLIENT_ID, MQTT_USERNAME, MQTT_PASSWORD, willTopic, willQoS, willRetain, willMessage);
  } else {
    connected = mqttClient.connect(MQTT_CLIENT_ID, willTopic, willQoS, willRetain, willMessage);
  }

  if (connected) {
    Serial.println("[MQTT] ✅ Connected Successfully to MQTT Broker!");
    digitalWrite(PIN_STATUS_LED, HIGH);

    // 1. Publish "online" availability status (retained)
    mqttClient.publish(TOPIC_AVAILABILITY, "online", true);

    // 2. Subscribe to required appliance control topics
    Serial.println("[MQTT] 📡 Subscribing to appliance command topics:");
    
    mqttClient.subscribe(TOPIC_LIGHT_SET);
    Serial.printf("   ✓ Subscribed: %s\n", TOPIC_LIGHT_SET);

    mqttClient.subscribe(TOPIC_FAN_SET);
    Serial.printf("   ✓ Subscribed: %s\n", TOPIC_FAN_SET);

    mqttClient.subscribe(TOPIC_PROJECTOR_SET);
    Serial.printf("   ✓ Subscribed: %s\n", TOPIC_PROJECTOR_SET);

    // Also subscribe to backward-compatible room wildcard topics
    mqttClient.subscribe("smartclassroom/room302/relay/+/set");
    Serial.println("   ✓ Subscribed: smartclassroom/room302/relay/+/set (Fallback)");

    // 3. Immediately publish initial power-on states so backend syncs
    Serial.println("[MQTT] 📤 Publishing initial hardware state snapshots...");
    publishDeviceStatus("LIGHT", TOPIC_LIGHT_STATUS, lightState);
    publishDeviceStatus("FAN", TOPIC_FAN_STATUS, fanState);
    publishDeviceStatus("PROJECTOR", TOPIC_PROJECTOR_STATUS, projectorState);

    Serial.println("[MQTT] 🚀 All subscriptions active. Ready for classroom commands!");
  } else {
    Serial.printf("[MQTT] ❌ Failed to connect. PubSubClient State: [%d]\n", mqttClient.state());
    Serial.println("[MQTT] 🔄 Retrying in 5 seconds...");
    digitalWrite(PIN_STATUS_LED, LOW);
  }
}

// ----------------------------------------------------------------------------
// ARDUINO SETUP (BOOT SEQUENCE)
// ----------------------------------------------------------------------------
void setup() {
  // 1. Initialize Serial interface for detailed debugging
  Serial.begin(115200);
  delay(1000); // Allow hardware serial buffer to stabilize
  printBanner();

  // 2. Configure GPIO relay output pins
  pinMode(PIN_RELAY_LIGHT, OUTPUT);
  pinMode(PIN_RELAY_FAN, OUTPUT);
  pinMode(PIN_RELAY_PROJECTOR, OUTPUT);
  pinMode(PIN_STATUS_LED, OUTPUT);

  // Initialize all appliances in safe OFF state on boot
  applyPinOutput(PIN_RELAY_LIGHT, false);
  applyPinOutput(PIN_RELAY_FAN, false);
  applyPinOutput(PIN_RELAY_PROJECTOR, false);
  digitalWrite(PIN_STATUS_LED, LOW);

  Serial.println("[BOOT] 🔌 GPIO Outputs initialized in OFF state.");

  // 3. Configure MQTT client settings
  mqttClient.setServer(MQTT_BROKER_HOST, MQTT_BROKER_PORT);
  mqttClient.setCallback(onMqttMessageReceived);
  mqttClient.setBufferSize(512); // Buffer size 512 bytes for structured JSON payloads

  // 4. Connect to Wi-Fi network
  connectToWiFi();
}

// ----------------------------------------------------------------------------
// MAIN LOOP (NON-BLOCKING RESILIENT EVENT PUMP)
// ----------------------------------------------------------------------------
void loop() {
  // 1. Ensure Wi-Fi stays connected
  if (WiFi.status() != WL_CONNECTED) {
    connectToWiFi();
  }

  // 2. Ensure MQTT stays connected
  if (WiFi.status() == WL_CONNECTED && !mqttClient.connected()) {
    connectToMQTT();
  }

  // 3. Process MQTT inbound and outbound packet queues
  if (mqttClient.connected()) {
    mqttClient.loop();
  }

  // 4. Periodic heartbeat / telemetry (every 30 seconds)
  unsigned long now = millis();
  if (now - lastTelemetryMs >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryMs = now;
    if (mqttClient.connected()) {
      char telemetryPayload[128];
      snprintf(
        telemetryPayload,
        sizeof(telemetryPayload),
        "{\"status\":\"online\",\"uptime\":%lu,\"rssi\":%d,\"heap\":%u}",
        now / 1000,
        WiFi.RSSI(),
        ESP.getFreeHeap()
      );
      mqttClient.publish(TOPIC_AVAILABILITY, telemetryPayload, false);
      Serial.printf("[HEARTBEAT] 💓 ESP32 Active | RSSI: %d dBm | Free Heap: %u bytes\n", WiFi.RSSI(), ESP.getFreeHeap());
    }
  }

  // 5. LED Status Indicator heartbeat
  if (now - lastStatusBlinkMs >= (mqttClient.connected() ? 2000 : 250)) {
    lastStatusBlinkMs = now;
    if (!mqttClient.connected()) {
      statusLedToggle = !statusLedToggle;
      digitalWrite(PIN_STATUS_LED, statusLedToggle ? HIGH : LOW);
    } else {
      digitalWrite(PIN_STATUS_LED, HIGH); // Solid ON when fully connected
    }
  }
}

/**
 * ============================================================================
 * SMART CLASSROOM IOT EMBEDDED CONTROLLER FIRMWARE
 * Target Hardware: ESP32 DevKit V1 / NodeMCU-32S / ESP-WROOM-32
 * Communication  : 2.4 GHz Wi-Fi + MQTT over TLS (Port 8883) or TCP (1883)
 * Target Broker  : EMQX Cloud (mqtts://z1910bc1.ala.us-east-1.emqxsl.com:8883)
 * Control Outputs: 3x Relays / Test LEDs (Light, Fan, Projector)
 * ============================================================================
 *
 * Hardware Control Flow:
 * Teacher Dashboard / Voice Assistant (React)
 *      │
 *      ▼ HTTPS REST / Web Speech API
 * Node.js Express Backend
 *      │
 *      ▼ MQTT Publish (QoS 1)
 * EMQX Cloud Broker (Port 8883 over TLS)
 *      │
 *      ▼ [smartclassroom/room302/relay/<appliance>/command]
 * [ESP32 Firmware]
 *      ├── Receives: JSON Command Payload {"command":"ON", "state":1}
 *      ├── Controls: GPIO 23 (Light), GPIO 22 (Fan), GPIO 21 (Projector)
 *      └── Publishes: State confirmation to [smartclassroom/room302/relay/<appliance>/state]
 *      │
 *      ▼ MQTT Telemetry (QoS 1)
 * Node.js Backend (deviceSync.service.js)
 *      │
 *      ▼ Real-Time WebSocket Broadcast
 * React Teacher Dashboard UI (instant update without page refresh!)
 * ============================================================================
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include "config.h"

// ----------------------------------------------------------------------------
// GLOBAL OBJECTS & NETWORKING CLIENTS
// ----------------------------------------------------------------------------
#if MQTT_USE_TLS
  WiFiClientSecure espClient;
#else
  WiFiClient espClient;
#endif

PubSubClient mqttClient(espClient);

// Logical relay output states (false = OFF, true = ON)
bool lightState     = false;
bool fanState       = false;
bool projectorState = false;

// Non-blocking timing trackers (millis)
unsigned long lastWifiRetryMs   = 0;
unsigned long lastMqttRetryMs   = 0;
unsigned long lastTelemetryMs   = 0;
unsigned long lastStatusBlinkMs = 0;
bool statusLedToggle            = false;
bool wifiConnectingStarted      = false;

// ----------------------------------------------------------------------------
// HARDWARE RELAY HELPER FUNCTION
// Translates logical ON/OFF state to physical GPIO pin voltage level
// based on whether relay board is configured as Active-LOW or Active-HIGH.
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
  Serial.printf("   Classroom : %s\n", CLASSROOM_SLUG);
  Serial.printf("   Protocol  : Wi-Fi (2.4 GHz) + MQTT %s (Port %d)\n", 
                MQTT_USE_TLS ? "over TLS (Encrypted)" : "Standard TCP", 
                MQTT_BROKER_PORT);
  Serial.println("================================================================");
  Serial.printf("   Light Output     : GPIO %d\n", PIN_RELAY_LIGHT);
  Serial.printf("   Fan Output       : GPIO %d\n", PIN_RELAY_FAN);
  Serial.printf("   Projector Output : GPIO %d\n", PIN_RELAY_PROJECTOR);
  Serial.printf("   Status LED       : GPIO %d\n", PIN_STATUS_LED);
  Serial.printf("   Relay Polarity   : %s\n", RELAY_ACTIVE_LOW ? "Active-LOW (5V Relay Board)" : "Active-HIGH (Direct LED Mode)");
  Serial.printf("   Broker Host      : %s\n", MQTT_BROKER_HOST);
  Serial.printf("   Client ID        : %s\n", MQTT_CLIENT_ID);
  Serial.println("================================================================\n");
}

// ----------------------------------------------------------------------------
// STATUS PUBLICATION HELPER
// Publishes standardized JSON state confirmation matching backend schema:
// { "deviceId": "...", "type": "...", "state": "ON"|"OFF", "isOnline": true, ... }
// ----------------------------------------------------------------------------
void publishDeviceStatus(const char* appliance, const char* stateTopic, bool state) {
  const char* stateStr = state ? "ON" : "OFF";

  // Map appliance name to exact MongoDB hardware deviceId
  const char* devId = "ESP32-RM302-LIGHT-01";
  const char* legacyTopic = "classroom/device/light/status";

  if (strcmp(appliance, "FAN") == 0) {
    devId = "ESP32-RM302-FAN-01";
    legacyTopic = "classroom/device/fan/status";
  } else if (strcmp(appliance, "PROJECTOR") == 0) {
    devId = "ESP32-RM302-PROJ-01";
    legacyTopic = "classroom/device/projector/status";
  }

  // 1. Build standardized JSON payload matching project specifications
  char jsonBuffer[256];
  snprintf(
    jsonBuffer,
    sizeof(jsonBuffer),
    "{\"deviceId\":\"%s\",\"type\":\"%s\",\"state\":\"%s\",\"isOnline\":true,\"rssi\":%d,\"uptime\":%lu}",
    devId,
    appliance,
    stateStr,
    WiFi.RSSI(),
    millis() / 1000
  );

  // 2. Publish to primary standardized state topic (smartclassroom/room302/relay/<appliance>/state)
  mqttClient.publish(stateTopic, jsonBuffer, false);

  // 3. Publish to legacy status topic for backwards compatibility
  mqttClient.publish(legacyTopic, jsonBuffer, false);

  // 4. Also publish plain text "ON" / "OFF" for diagnostic terminal monitoring
  char rawTopic[80];
  snprintf(rawTopic, sizeof(rawTopic), "%s/raw", stateTopic);
  mqttClient.publish(rawTopic, stateStr, false);

  Serial.printf("[MQTT OUT] 📤 Published state confirmation to [%s] -> %s (DeviceId: %s)\n", stateTopic, stateStr, devId);
}

// ----------------------------------------------------------------------------
// INCOMING MQTT COMMAND CALLBACK DISPATCHER
// Parses backend JSON command payload:
// { "deviceId": "...", "command": "ON", "state": 1, "gpioPin": ... }
// ----------------------------------------------------------------------------
void onMqttMessageReceived(char* topic, byte* payload, unsigned int length) {
  // Convert payload buffer to null-terminated C string
  char message[length + 1];
  memcpy(message, payload, length);
  message[length] = '\0';

  Serial.println("\n----------------------------------------------------------------");
  Serial.printf("[MQTT IN] 📥 Message received on Topic: [%s]\n", topic);
  Serial.printf("[MQTT IN] 📦 Command Payload: \"%s\" (%d bytes)\n", message, length);

  // Normalize string for robust matching
  String payloadStr = String(message);
  payloadStr.trim();
  String payloadUpper = payloadStr;
  payloadUpper.toUpperCase();

  // Parse command action: ON or OFF
  // Accommodates:
  // 1. JSON {"command":"ON"} or {"command": "ON"}
  // 2. Numeric JSON {"state":1} or {"state": 1}
  // 3. Plain text "ON" or "1"
  bool commandIsOn = (
    payloadUpper == "ON" || payloadUpper == "1" ||
    payloadUpper.indexOf("\"COMMAND\":\"ON\"") >= 0 ||
    payloadUpper.indexOf("\"COMMAND\": \"ON\"") >= 0 ||
    payloadUpper.indexOf("\"STATE\":1") >= 0 ||
    payloadUpper.indexOf("\"STATE\": 1") >= 0
  );

  bool commandIsOff = (
    payloadUpper == "OFF" || payloadUpper == "0" ||
    payloadUpper.indexOf("\"COMMAND\":\"OFF\"") >= 0 ||
    payloadUpper.indexOf("\"COMMAND\": \"OFF\"") >= 0 ||
    payloadUpper.indexOf("\"STATE\":0") >= 0 ||
    payloadUpper.indexOf("\"STATE\": 0") >= 0
  );

  if (!commandIsOn && !commandIsOff) {
    Serial.printf("[WARN] ⚠️ Unrecognized command action in payload: \"%s\". Ignoring.\n", message);
    Serial.println("----------------------------------------------------------------");
    return;
  }

  bool targetState = commandIsOn;
  String topicStr = String(topic);

  // --------------------------------------------------------------------------
  // 1. LIGHT APPLIANCE HANDLER
  // Matches: smartclassroom/room302/relay/light/command, classroom/device/light/set
  // --------------------------------------------------------------------------
  if (topicStr == TOPIC_LIGHT_COMMAND || 
      topicStr.indexOf("/light/command") >= 0 || 
      topicStr.indexOf("/light/set") >= 0 || 
      topicStr.indexOf("/light") >= 0) {
    lightState = targetState;
    applyPinOutput(PIN_RELAY_LIGHT, lightState);
    Serial.printf("[HARDWARE] 💡 LIGHT set to: [%s] on GPIO %d\n", lightState ? "ON" : "OFF", PIN_RELAY_LIGHT);
    publishDeviceStatus("LIGHT", TOPIC_LIGHT_STATE, lightState);
  }
  // --------------------------------------------------------------------------
  // 2. FAN APPLIANCE HANDLER
  // Matches: smartclassroom/room302/relay/fan/command, classroom/device/fan/set
  // --------------------------------------------------------------------------
  else if (topicStr == TOPIC_FAN_COMMAND || 
           topicStr.indexOf("/fan/command") >= 0 || 
           topicStr.indexOf("/fan/set") >= 0 || 
           topicStr.indexOf("/fan") >= 0) {
    fanState = targetState;
    applyPinOutput(PIN_RELAY_FAN, fanState);
    Serial.printf("[HARDWARE] 🌀 FAN set to: [%s] on GPIO %d\n", fanState ? "ON" : "OFF", PIN_RELAY_FAN);
    publishDeviceStatus("FAN", TOPIC_FAN_STATE, fanState);
  }
  // --------------------------------------------------------------------------
  // 3. PROJECTOR APPLIANCE HANDLER
  // Matches: smartclassroom/room302/relay/projector/command, classroom/device/projector/set
  // --------------------------------------------------------------------------
  else if (topicStr == TOPIC_PROJECTOR_COMMAND || 
           topicStr.indexOf("/projector/command") >= 0 || 
           topicStr.indexOf("/projector/set") >= 0 || 
           topicStr.indexOf("/projector") >= 0) {
    projectorState = targetState;
    applyPinOutput(PIN_RELAY_PROJECTOR, projectorState);
    Serial.printf("[HARDWARE] 📽️ PROJECTOR set to: [%s] on GPIO %d\n", projectorState ? "ON" : "OFF", PIN_RELAY_PROJECTOR);
    publishDeviceStatus("PROJECTOR", TOPIC_PROJECTOR_STATE, projectorState);
  }
  else {
    Serial.printf("[WARN] ⚠️ Unmatched command topic: [%s]\n", topic);
  }

  Serial.println("----------------------------------------------------------------");
}

// ----------------------------------------------------------------------------
// NON-BLOCKING WI-FI CONNECTION MANAGER
// ----------------------------------------------------------------------------
void handleWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    if (!wifiConnectingStarted) {
      wifiConnectingStarted = true;
      Serial.println("\n[Wi-Fi] ✅ Wi-Fi Connected Successfully!");
      Serial.printf("[Wi-Fi] 📍 IP Address : %s\n", WiFi.localIP().toString().c_str());
      Serial.printf("[Wi-Fi] 📶 Signal (RSSI): %d dBm\n", WiFi.RSSI());
      Serial.printf("[Wi-Fi] 🏷️ MAC Address : %s\n", WiFi.macAddress().c_str());
    }
    return;
  }

  // If Wi-Fi lost or disconnected, trigger reconnect non-blockingly
  wifiConnectingStarted = false;
  unsigned long now = millis();
  if (now - lastWifiRetryMs >= WIFI_RECONNECT_INTERVAL_MS) {
    lastWifiRetryMs = now;
    Serial.println("\n[Wi-Fi] 🌐 Connecting to 2.4 GHz Wi-Fi...");
    Serial.printf("[Wi-Fi] 📡 SSID: \"%s\"\n", WIFI_SSID);

    WiFi.disconnect();
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }
}

// ----------------------------------------------------------------------------
// NON-BLOCKING MQTT CONNECTION & SUBSCRIPTION MANAGER
// ----------------------------------------------------------------------------
void handleMQTT() {
  if (WiFi.status() != WL_CONNECTED) {
    return; // Wait for Wi-Fi first
  }

  if (mqttClient.connected()) {
    return; // Already healthy and connected
  }

  // Non-blocking retry backoff
  unsigned long now = millis();
  if (now - lastMqttRetryMs < MQTT_RECONNECT_INTERVAL_MS) {
    return;
  }
  lastMqttRetryMs = now;

  Serial.println("\n[MQTT] 🔌 Connecting to MQTT Broker...");
  Serial.printf("[MQTT] 🖥️ Broker Host : %s:%d (TLS: %s)\n", 
                MQTT_BROKER_HOST, MQTT_BROKER_PORT, MQTT_USE_TLS ? "true" : "false");
  Serial.printf("[MQTT] 🆔 Client ID   : %s\n", MQTT_CLIENT_ID);

  // Configure Last Will and Testament (LWT)
  // If ESP32 loses power or network dropped, EMQX automatically publishes this offline event
  const char* willTopic   = TOPIC_AVAILABILITY;
  const char* willMessage = "{\"status\":\"offline\",\"classroom\":\"" CLASSROOM_SLUG "\"}";
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

    // 1. Publish "online" availability telemetry (retained so new subscribers see current status)
    char onlinePayload[128];
    snprintf(onlinePayload, sizeof(onlinePayload), 
             "{\"status\":\"online\",\"classroom\":\"%s\",\"uptime\":%lu,\"rssi\":%d}", 
             CLASSROOM_SLUG, millis() / 1000, WiFi.RSSI());
    mqttClient.publish(TOPIC_AVAILABILITY, onlinePayload, true);

    // 2. Subscribe to standardized appliance command topics
    Serial.println("[MQTT] 📡 Subscribing to appliance command topics:");

    mqttClient.subscribe(TOPIC_LIGHT_COMMAND, 1);
    Serial.printf("   ✓ Subscribed: %s\n", TOPIC_LIGHT_COMMAND);

    mqttClient.subscribe(TOPIC_FAN_COMMAND, 1);
    Serial.printf("   ✓ Subscribed: %s\n", TOPIC_FAN_COMMAND);

    mqttClient.subscribe(TOPIC_PROJECTOR_COMMAND, 1);
    Serial.printf("   ✓ Subscribed: %s\n", TOPIC_PROJECTOR_COMMAND);

    // Also subscribe to wildcard command topic for future appliance expansion
    mqttClient.subscribe(TOPIC_ALL_COMMANDS, 1);
    Serial.printf("   ✓ Subscribed: %s (Standard Wildcard)\n", TOPIC_ALL_COMMANDS);

    // Legacy fallback topic
    mqttClient.subscribe(TOPIC_LEGACY_COMMANDS, 1);
    Serial.printf("   ✓ Subscribed: %s (Legacy Fallback)\n", TOPIC_LEGACY_COMMANDS);

    // 3. Immediately publish initial power-on states so backend database syncs
    Serial.println("[MQTT] 📤 Publishing initial hardware state snapshots...");
    publishDeviceStatus("LIGHT", TOPIC_LIGHT_STATE, lightState);
    publishDeviceStatus("FAN", TOPIC_FAN_STATE, fanState);
    publishDeviceStatus("PROJECTOR", TOPIC_PROJECTOR_STATE, projectorState);

    Serial.println("[MQTT] 🚀 All subscriptions active. Ready for classroom commands!");
  } else {
    Serial.printf("[MQTT] ❌ Connection failed. PubSubClient State: [%d]\n", mqttClient.state());
    Serial.println("[MQTT] 🔄 Will retry in 5 seconds...");
    digitalWrite(PIN_STATUS_LED, LOW);
  }
}

// ----------------------------------------------------------------------------
// ARDUINO SETUP (BOOT SEQUENCE)
// ----------------------------------------------------------------------------
void setup() {
  // 1. Initialize Serial interface for detailed debugging
  Serial.begin(115200);
  delay(500); // Allow hardware UART to stabilize
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

  Serial.println("[BOOT] 🔌 GPIO Outputs initialized in safe OFF state.");

  // 3. Configure TLS Security on WiFiClientSecure (if TLS enabled)
#if MQTT_USE_TLS
  #if USE_CA_CERT
    Serial.println("[SECURITY] 🔒 Configuring TLS with ISRG Root X1 CA Certificate...");
    espClient.setCACert(EMQX_CA_CERT);
  #else
    Serial.println("[SECURITY] ⚠️ TLS mode active with setInsecure() (Certificate verification disabled for testing)");
    espClient.setInsecure();
  #endif
#endif

  // 4. Configure MQTT client settings
  mqttClient.setServer(MQTT_BROKER_HOST, MQTT_BROKER_PORT);
  mqttClient.setCallback(onMqttMessageReceived);
  mqttClient.setBufferSize(512); // Buffer size 512 bytes for structured JSON payloads

  // 5. Begin Wi-Fi Connection
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  lastWifiRetryMs = millis();
}

// ----------------------------------------------------------------------------
// MAIN LOOP (NON-BLOCKING RESILIENT EVENT PUMP)
// ----------------------------------------------------------------------------
void loop() {
  // 1. Non-blocking Wi-Fi watchdog
  handleWiFi();

  // 2. Non-blocking MQTT watchdog
  handleMQTT();

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
        "{\"status\":\"online\",\"classroom\":\"%s\",\"uptime\":%lu,\"rssi\":%d,\"heap\":%u}",
        CLASSROOM_SLUG,
        now / 1000,
        WiFi.RSSI(),
        ESP.getFreeHeap()
      );
      mqttClient.publish(TOPIC_AVAILABILITY, telemetryPayload, false);
      Serial.printf("[HEARTBEAT] 💓 ESP32 Telemetry | RSSI: %d dBm | Free Heap: %u bytes\n", WiFi.RSSI(), ESP.getFreeHeap());
    }
  }

  // 5. LED Status Indicator heartbeat
  // Fast blink = connecting/offline; Solid ON = fully connected; brief flicker = healthy
  if (now - lastStatusBlinkMs >= (mqttClient.connected() ? 2000 : 250)) {
    lastStatusBlinkMs = now;
    if (!mqttClient.connected()) {
      statusLedToggle = !statusLedToggle;
      digitalWrite(PIN_STATUS_LED, statusLedToggle ? HIGH : LOW);
    } else {
      digitalWrite(PIN_STATUS_LED, HIGH);
    }
  }
}

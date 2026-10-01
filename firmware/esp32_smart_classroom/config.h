#ifndef CONFIG_H
#define CONFIG_H

// ============================================================================
// SMART CLASSROOM ESP32 FIRMWARE CONFIGURATION
// AI Voice-Controlled Smart Classroom Project
// ============================================================================

// ----------------------------------------------------------------------------
// 1. WI-FI NETWORK CONFIGURATION
// ----------------------------------------------------------------------------
// Enter your 2.4 GHz Wi-Fi SSID and Password.
// Note: ESP32 hardware supports 2.4 GHz Wi-Fi (802.11 b/g/n), not 5 GHz.
#define WIFI_SSID           "YOUR_WIFI_SSID"
#define WIFI_PASSWORD       "YOUR_WIFI_PASSWORD"

// ----------------------------------------------------------------------------
// 2. MQTT BROKER CONFIGURATION
// ----------------------------------------------------------------------------
// IP address or hostname of your MQTT Broker machine.
// If the backend runs on your laptop/PC on the same local Wi-Fi,
// find your PC's IP using "ipconfig" in cmd (e.g., "192.168.1.100").
// Do NOT use "localhost" or "127.0.0.1" because ESP32 has its own loopback.
#define MQTT_BROKER_HOST    "192.168.1.100"
#define MQTT_BROKER_PORT    1883

// Optional MQTT credentials (leave blank if your broker allows anonymous)
#define MQTT_USERNAME       ""
#define MQTT_PASSWORD       ""

// Unique MQTT Client Identifier for this ESP32 board
#define MQTT_CLIENT_ID      "ESP32_SmartClassroom_Room302"

// ----------------------------------------------------------------------------
// 3. GPIO PIN ASSIGNMENTS
// ----------------------------------------------------------------------------
// Standard safe output GPIOs on ESP32 DevKit (avoid boot-strapping GPIO 0, 2, 12, 15)
#define PIN_RELAY_LIGHT     23  // Relay Channel 1: Classroom Lights / LED 1
#define PIN_RELAY_FAN       22  // Relay Channel 2: Ceiling Fans / LED 2
#define PIN_RELAY_PROJECTOR 21  // Relay Channel 3: Projector / LED 3

// Onboard diagnostic status LED (built-in blue LED on most ESP32 DevKits is GPIO 2)
#define PIN_STATUS_LED      2

// ----------------------------------------------------------------------------
// 4. HARDWARE RELAY POLARITY (Active-Low vs Active-High)
// ----------------------------------------------------------------------------
// Set to true if using standard 5V Relay Modules (Active-LOW: LOW = ON, HIGH = OFF).
// Set to false if testing with bare LEDs and current-limiting resistors (Active-HIGH: HIGH = ON, LOW = OFF).
#define RELAY_ACTIVE_LOW    false

// ----------------------------------------------------------------------------
// 5. MQTT TOPIC DEFINITIONS (Strictly matches project specification)
// ----------------------------------------------------------------------------
// Inbound Command Topics (ESP32 subscribes to these)
#define TOPIC_LIGHT_SET        "classroom/device/light/set"
#define TOPIC_FAN_SET          "classroom/device/fan/set"
#define TOPIC_PROJECTOR_SET    "classroom/device/projector/set"

// Outbound Status Topics (ESP32 publishes status updates to these)
#define TOPIC_LIGHT_STATUS     "classroom/device/light/status"
#define TOPIC_FAN_STATUS       "classroom/device/fan/status"
#define TOPIC_PROJECTOR_STATUS "classroom/device/projector/status"

// Board Availability / Last Will and Testament (LWT) Topic
#define TOPIC_AVAILABILITY     "classroom/device/availability"

// Optional Telemetry / Heartbeat interval in milliseconds (30 seconds)
#define TELEMETRY_INTERVAL_MS  30000

#endif // CONFIG_H

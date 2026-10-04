#ifndef CONFIG_H
#define CONFIG_H

// ============================================================================
// SMART CLASSROOM ESP32 FIRMWARE CONFIGURATION
// AI Voice-Controlled Smart Classroom Project
// ============================================================================

#include "ca_cert.h"

// ----------------------------------------------------------------------------
// 0. SECRETS IMPORT (Local & Untracked)
// ----------------------------------------------------------------------------
// If a local "secrets.h" exists (copied from secrets.h.example), its values
// will automatically override the defaults below. "secrets.h" is ignored by Git.
#if __has_include("secrets.h")
  #include "secrets.h"
#endif

// ----------------------------------------------------------------------------
// 1. WI-FI NETWORK CONFIGURATION (2.4 GHz ONLY)
// ----------------------------------------------------------------------------
#ifdef SECRET_WIFI_SSID
  #define WIFI_SSID           SECRET_WIFI_SSID
  #define WIFI_PASSWORD       SECRET_WIFI_PASSWORD
#else
  #define WIFI_SSID           "YOUR_2.4GHZ_WIFI_SSID"
  #define WIFI_PASSWORD       "YOUR_WIFI_PASSWORD"
#endif

// ----------------------------------------------------------------------------
// 2. MQTT BROKER CONFIGURATION (EMQX Cloud TLS / Local Development)
// ----------------------------------------------------------------------------
#ifdef SECRET_MQTT_HOST
  #define MQTT_BROKER_HOST    SECRET_MQTT_HOST
  #define MQTT_BROKER_PORT    SECRET_MQTT_PORT
  #define MQTT_USE_TLS        SECRET_MQTT_USE_TLS
#else
  // Default: EMQX Cloud TLS over port 8883
  #define MQTT_BROKER_HOST    "z1910bc1.ala.us-east-1.emqxsl.com"
  #define MQTT_BROKER_PORT    8883
  #define MQTT_USE_TLS        true
#endif

#ifdef SECRET_MQTT_USER
  #define MQTT_USERNAME       SECRET_MQTT_USER
  #define MQTT_PASSWORD       SECRET_MQTT_PASS
#else
  #define MQTT_USERNAME       ""
  #define MQTT_PASSWORD       ""
#endif

#ifdef SECRET_MQTT_CLIENT_ID
  #define MQTT_CLIENT_ID      SECRET_MQTT_CLIENT_ID
#else
  #define MQTT_CLIENT_ID      "ESP32_SmartClassroom_Room302"
#endif

// CA root certificate verification flag (true = verify ISRG Root X1, false = setInsecure)
#ifdef SECRET_USE_CA_CERT
  #define USE_CA_CERT         SECRET_USE_CA_CERT
#else
  #define USE_CA_CERT         true
#endif

// ----------------------------------------------------------------------------
// 3. CLASSROOM & TOPIC HIERARCHY CONFIGURATION
// ----------------------------------------------------------------------------
// Change CLASSROOM_SLUG to deploy firmware to different classrooms (e.g. "room303", "lab101")
#define CLASSROOM_SLUG        "room302"

// Inbound Command Topics (ESP32 subscribes to these)
#define TOPIC_LIGHT_COMMAND        "smartclassroom/" CLASSROOM_SLUG "/relay/light/command"
#define TOPIC_FAN_COMMAND          "smartclassroom/" CLASSROOM_SLUG "/relay/fan/command"
#define TOPIC_PROJECTOR_COMMAND    "smartclassroom/" CLASSROOM_SLUG "/relay/projector/command"

// Outbound State Topics (ESP32 publishes status updates to these)
#define TOPIC_LIGHT_STATE          "smartclassroom/" CLASSROOM_SLUG "/relay/light/state"
#define TOPIC_FAN_STATE            "smartclassroom/" CLASSROOM_SLUG "/relay/fan/state"
#define TOPIC_PROJECTOR_STATE      "smartclassroom/" CLASSROOM_SLUG "/relay/projector/state"

// Projector RGB Lighting Topics (Independent PWM color channel)
#define TOPIC_RGB_COMMAND          "smartclassroom/" CLASSROOM_SLUG "/projector/color/command"
#define TOPIC_RGB_STATE            "smartclassroom/" CLASSROOM_SLUG "/projector/color/state"

// Board Availability / Last Will and Testament (LWT) Topic
#define TOPIC_AVAILABILITY         "smartclassroom/" CLASSROOM_SLUG "/availability"

// Standard Wildcard Subscription Topic
#define TOPIC_ALL_COMMANDS         "smartclassroom/" CLASSROOM_SLUG "/relay/+/command"

// Legacy Fallback Topics (for backwards compatibility)
#define TOPIC_LIGHT_SET            TOPIC_LIGHT_COMMAND
#define TOPIC_FAN_SET              TOPIC_FAN_COMMAND
#define TOPIC_PROJECTOR_SET        TOPIC_PROJECTOR_COMMAND
#define TOPIC_LIGHT_STATUS         TOPIC_LIGHT_STATE
#define TOPIC_FAN_STATUS           TOPIC_FAN_STATE
#define TOPIC_PROJECTOR_STATUS     TOPIC_PROJECTOR_STATE
#define TOPIC_LEGACY_AVAILABILITY  "classroom/device/availability"
#define TOPIC_LEGACY_COMMANDS      "classroom/device/+/set"

// ----------------------------------------------------------------------------
// 4. GPIO PIN CONFIGURATION & MAPPING
// ----------------------------------------------------------------------------
// Standard output GPIOs on ESP32 DevKit. Modify if custom wiring is used.
#define PIN_RELAY_LIGHT            23  // Relay Channel 1: Classroom Lights
#define PIN_RELAY_FAN              22  // Relay Channel 2: Ceiling Fans
#define PIN_RELAY_PROJECTOR        21  // Relay Channel 3: Projector Master Power (1-channel 5V relay)

// Common-Cathode 4-terminal RGB LED (Cathode to GND, Anodes through 220Ω resistors)
#define PIN_RGB_RED                25  // Red LED Anode (PWM)
#define PIN_RGB_GREEN              27  // Green LED Anode (PWM)
#define PIN_RGB_BLUE               32  // Blue LED Anode (PWM)

// Onboard diagnostic status LED (built-in blue LED on most ESP32 DevKits is GPIO 2)
#define PIN_STATUS_LED             2

// ----------------------------------------------------------------------------
// 5. HARDWARE RELAY POLARITY (Active-Low vs Active-High)
// ----------------------------------------------------------------------------
// Set to true if using standard 5V Relay Modules (Active-LOW: LOW = ON, HIGH = OFF).
// Set to false if testing with bare LEDs and current-limiting resistors (Active-HIGH: HIGH = ON, LOW = OFF).
#define RELAY_ACTIVE_LOW           false

// ----------------------------------------------------------------------------
// 6. TELEMETRY & RECONNECTION TIMINGS (Non-blocking milliseconds)
// ----------------------------------------------------------------------------
#define TELEMETRY_INTERVAL_MS      30000  // Heartbeat telemetry interval (30 seconds)
#define MQTT_RECONNECT_INTERVAL_MS 5000   // MQTT reconnect retry backoff (5 seconds)
#define WIFI_RECONNECT_INTERVAL_MS 10000  // Wi-Fi reconnect retry backoff (10 seconds)

#endif // CONFIG_H

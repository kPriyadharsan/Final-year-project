# 🔌 ESP32 Smart Classroom IoT Firmware

This directory contains the production-ready Arduino firmware for the **AI Voice-Controlled Smart Classroom** project.

The firmware connects an **ESP32 microcontroller** to your local 2.4 GHz Wi-Fi and MQTT broker to receive appliance control commands from the **Teacher Dashboard** and **Voice Assistant**, safely driving three appliance relay channels (Light, Fan, Projector) and reporting real-time hardware status back to the backend.

---

## 📋 Table of Contents
1. [Hardware Specifications](#1-hardware-specifications)
2. [Wiring & Circuit Diagrams](#2-wiring--circuit-diagrams)
3. [Safety Notice for 230V AC](#3-safety-notice-for-230v-ac)
4. [Software Prerequisites](#4-software-prerequisites)
5. [Firmware Configuration (`config.h`)](#5-firmware-configuration-configh)
6. [Step-by-Step Upload Instructions](#6-step-by-step-upload-instructions)
7. [Serial Monitor Verification](#7-serial-monitor-verification)
8. [End-to-End System Testing](#8-end-to-end-system-testing)
9. [Troubleshooting Guide](#9-troubleshooting-guide)

---

## 1. Hardware Specifications

| Component | Recommendation | Function |
| :--- | :--- | :--- |
| **Microcontroller** | ESP32 DevKit V1 (30-pin or 36-pin) | Wi-Fi + MQTT microcontroller |
| **Channel 1 Output** | GPIO 23 | Classroom Main Lights |
| **Channel 2 Output** | GPIO 22 | Ceiling Fans |
| **Channel 3 Output** | GPIO 21 | Digital Projector |
| **Onboard Status LED** | GPIO 2 | Wi-Fi / MQTT connection indicator |
| **Testing Load** | 3x LEDs + 3x 220Ω–330Ω resistors | Safe development load (0–3.3V) |
| **Production Load** | 3-channel or 4-channel 5V Relay Module | Isolates low-voltage MCU from appliances |

---

## 2. Wiring & Circuit Diagrams

### Option A: Safe Breadboard Development Setup (Recommended for Initial Testing)
> [!TIP]
> Always test with safe low-voltage DC LEDs before connecting mains AC appliances.

```
       ESP32 DevKit V1
   ┌──────────────────────┐
   │                      │
   │  GPIO 23 (Light)     ├───[ 220Ω Resistor ]───( Anode LED 1 Red )───┐
   │                      │                                               │
   │  GPIO 22 (Fan)       ├───[ 220Ω Resistor ]───( Anode LED 2 Blue )──┼─── GND
   │                      │                                               │
   │  GPIO 21 (Projector) ├───[ 220Ω Resistor ]───( Anode LED 3 Grn )───┘
   │                      │
   │  GND                 ├───────────────────────────────────────────────┘
   └──────────────────────┘
```
*Note: For direct LED testing, set `#define RELAY_ACTIVE_LOW false` in `config.h`.*

---

### Option B: 5V Relay Module Setup
Standard multi-channel relay boards feature optocoupler isolation and are typically **Active-LOW** (a `LOW` voltage triggers the relay coil).

```
   ESP32 Pin          Relay Module Pin
   ───────────────────────────────────
   VIN (5V)     ───>  VCC
   GND          ───>  GND
   GPIO 23      ───>  IN1 (Light Relay)
   GPIO 22      ───>  IN2 (Fan Relay)
   GPIO 21      ───>  IN3 (Projector Relay)
```
*Note: For standard 5V relay modules, set `#define RELAY_ACTIVE_LOW true` in `config.h`.*

---

## 3. Safety Notice for 230V AC

> [!CAUTION]
> **HIGH VOLTAGE WARNING:** 230V AC mains electricity can cause severe shock, electrocution, or fire.
> - Perform all initial code uploads, MQTT validation, and dashboard synchronization using **LEDs or low-voltage DC buzzers**.
> - Only wire 230V mains lines inside an insulated, flame-retardant electrical enclosure with circuit breakers and under qualified supervision.
> - Never touch the relay board or ESP32 pins when mains electricity is energized.

---

## 4. Software Prerequisites

### Step 1: Install Arduino IDE
Download and install **Arduino IDE 2.x** (or 1.8.19) from [arduino.cc/en/software](https://www.arduino.cc/en/software).

### Step 2: Install ESP32 Board Package
1. In Arduino IDE, go to **File** → **Preferences**.
2. In the **Additional boards manager URLs** field, paste:
   ```text
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. Click **OK**.
4. Open **Tools** → **Board** → **Boards Manager...**.
5. Search for `esp32` and install **esp32 by Espressif Systems** (version 2.0.14 or later).

### Step 3: Install Required Arduino Libraries
Open **Tools** → **Manage Libraries...** and search for:
1. **PubSubClient** (by *Nick O'Leary*) → Click **Install**.
   *(Lightweight, standard MQTT client for Arduino/ESP32)*.

---

## 5. Firmware Configuration (`config.h`)

Open `firmware/esp32_smart_classroom/config.h` and update the constants for your local network:

```cpp
// 1. Wi-Fi Settings (Must be 2.4 GHz)
#define WIFI_SSID           "My_Home_WiFi"
#define WIFI_PASSWORD       "SecretPassword123"

// 2. MQTT Broker Host IP
// Find your laptop/PC IPv4 address using "ipconfig" in Windows Command Prompt
#define MQTT_BROKER_HOST    "192.168.1.15"  // Do NOT use localhost/127.0.0.1
#define MQTT_BROKER_PORT    1883

// 3. Hardware Relay Mode
// Set false for testing with LEDs (HIGH = ON)
// Set true for 5V Relay Modules (LOW = ON)
#define RELAY_ACTIVE_LOW    false
```

### How to Find Your PC's Local IP Address on Windows:
1. Press `Win + R`, type `cmd`, and press Enter.
2. Type `ipconfig` and press Enter.
3. Locate **Wireless LAN adapter Wi-Fi** or **Ethernet adapter**.
4. Copy the **IPv4 Address** (e.g., `192.168.1.15`) into `MQTT_BROKER_HOST`.

---

## 6. Step-by-Step Upload Instructions

1. **Connect ESP32 to PC:** Plug the ESP32 into a USB port using a quality micro-USB / USB-C data cable (avoid charge-only cables).
2. **Open Sketch:** In Arduino IDE, open:
   `WebApp/firmware/esp32_smart_classroom/esp32_smart_classroom.ino`.
3. **Select Board:** Go to **Tools** → **Board** → **esp32** → select **DOIT ESP32 DEVKIT V1** (or *ESP32 Dev Module*).
4. **Select Port:** Go to **Tools** → **Port** and select the active COM port (e.g., `COM3`, `COM4`, etc.).
   *(If no port appears, install the CP2102 or CH340 USB-to-UART driver for your ESP32 board).*
5. **Set Upload Speed:** Go to **Tools** → **Upload Speed** → select **115200** or **921600**.
6. **Compile and Upload:** Click the **Upload (arrow)** button.
7. **Boot Button Tip:** If the output console shows `Connecting........_____.....`:
   - Press and hold the **BOOT (or FLASH)** button on the ESP32 board for 2 seconds until the upload progress percentage starts counting.

---

## 7. Serial Monitor Verification

1. Once uploaded, open **Tools** → **Serial Monitor**.
2. In the bottom-right corner of Serial Monitor, set the baud rate to **115200 baud**.
3. Press the **EN (Reset)** button on the ESP32 to restart the board.
4. You will observe the complete step-by-step startup diagnostics:

```text
================================================================
   🤖 SMART CLASSROOM ESP32 IoT CONTROLLER FIRMWARE
   Project   : AI Voice-Controlled Smart Classroom
   Hardware  : ESP32 DevKit (Dual-Core 240MHz)
   Protocol  : Wi-Fi (802.11 b/g/n) + MQTT (Port 1883)
================================================================
   Light Output     : GPIO 23
   Fan Output       : GPIO 22
   Projector Output : GPIO 21
   Status LED       : GPIO 2
   Relay Polarity   : Active-HIGH (LED Mode)
================================================================

[BOOT] 🔌 GPIO Outputs initialized in OFF state.

[Wi-Fi] 🌐 Initializing Wi-Fi Connection...
[Wi-Fi] 📡 Target SSID: "My_Home_WiFi"
......
[Wi-Fi] ✅ Wi-Fi Connected Successfully!
[Wi-Fi] 📍 Assigned IPv4 Address : 192.168.1.45
[Wi-Fi] 📶 Signal Strength (RSSI): -54 dBm
[Wi-Fi] 🏷️ MAC Address            : 24:6F:28:XX:XX:XX

[MQTT] 🔌 Connecting to MQTT Broker...
[MQTT] 🖥️ Broker Host : 192.168.1.15:1883
[MQTT] 🆔 Client ID   : ESP32_SmartClassroom_Room302
[MQTT] ✅ Connected Successfully to MQTT Broker!
[MQTT] 📡 Subscribing to appliance command topics:
   ✓ Subscribed: classroom/device/light/set
   ✓ Subscribed: classroom/device/fan/set
   ✓ Subscribed: classroom/device/projector/set
   ✓ Subscribed: smartclassroom/room302/relay/+/set (Fallback)
[MQTT] 📤 Publishing initial hardware state snapshots...
[MQTT] 📤 Published [classroom/device/light/status] -> OFF
[MQTT] 📤 Published [classroom/device/fan/status] -> OFF
[MQTT] 📤 Published [classroom/device/projector/status] -> OFF
[MQTT] 🚀 All subscriptions active. Ready for classroom commands!
```

---

## 8. End-to-End System Testing

### Test 1: Button Control from Teacher Dashboard
1. Open the Teacher Dashboard at `http://localhost:5173/teacher`.
2. Locate the **Ceiling Fans** device card.
3. Click the toggle switch to **ON**:
   - The dashboard calls backend `POST /api/devices/:id/command`.
   - The backend publishes payload to MQTT topic `classroom/device/fan/set`.
   - **ESP32 Serial Monitor prints:**
     ```text
     ----------------------------------------------------------------
     [MQTT IN] 📥 Message received on Topic: [classroom/device/fan/set]
     [MQTT IN] 📦 Raw Payload: "{"deviceId":"ESP32-RM302-FAN-01","command":"ON"}"
     [HARDWARE] 🌀 FAN set to: [ON] on GPIO 22
     [MQTT OUT] 📤 Published [classroom/device/fan/status] -> ON
     ----------------------------------------------------------------
     ```
   - GPIO 22 goes HIGH and the Fan LED/relay illuminates immediately!
   - Dashboard card confirms with: `"Fan ON command sent."`

### Test 2: Voice Command via Browser Speech Recognition
1. Click the **Voice Assistant** button on the Teacher Dashboard.
2. Click **Start Listening** and speak into your microphone:
   > *"Turn on the classroom lights"*
3. **Pipeline Execution:**
   - Web Speech API transcribes audio → sends to `POST /api/voice/command`.
   - Gemini classifies intent as `DEVICE_CONTROL` (`light`, `ON`).
   - Backend publishes to `classroom/device/light/set`.
   - **ESP32 executes command:** GPIO 23 turns ON.
   - ESP32 publishes status to `classroom/device/light/status`.
   - Socket.IO updates the dashboard light card instantly with green badge!
   - Voice assistant shows: `"Light ON command sent."`

---

## 9. Troubleshooting Guide

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **Wi-Fi will not connect (dots continue indefinitely)** | 5 GHz network or wrong password | Ensure router broadcasts **2.4 GHz**. Check SSID & password in `config.h`. |
| **MQTT failed to connect (State: -2)** | Wrong broker IP or broker closed | Run `ipconfig` on host PC and update `MQTT_BROKER_HOST`. Ensure Express server with embedded broker is running on port 1883. |
| **Relay is ON when dashboard says OFF** | Active-LOW vs Active-HIGH mismatch | Toggle `#define RELAY_ACTIVE_LOW true` in `config.h` and re-upload. |
| **"Command could not be delivered."** | ESP32 or MQTT broker is offline | Ensure ESP32 is powered on and Serial Monitor reports `[MQTT] Connected`. |
| **Arduino IDE fails to compile (`PubSubClient.h missing`)** | Library not installed | Open Library Manager, search `PubSubClient`, and install it. |

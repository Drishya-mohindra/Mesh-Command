#!/bin/bash
# Turns a Raspberry Pi (or any Linux box with a WiFi card) into a self-contained
# WiFi access point running the Mesh Command Post — no internet uplink required.
#
# Run once per session with: sudo bash setup/setup-ap.sh
set -e

echo "🛰️  Setting up Mesh Command Post access point..."

# 1. Install AP + DNS/DHCP tools
sudo apt-get update -y
sudo apt-get install -y hostapd dnsmasq

# 2. Stop services while we configure them
sudo systemctl stop hostapd
sudo systemctl stop dnsmasq

# 3. Give wlan0 a static IP — this becomes the "gateway" every phone talks to
sudo ip addr flush dev wlan0
sudo ip addr add 192.168.4.1/24 dev wlan0

# 4. Choose an SSID and a channel, then render the hostapd template.
#
#    SSID: defaults to a random 3-digit suffix so two teams at the same event
#    don't both broadcast "MeshCommandPost" and confuse judges between booths.
#      AP_SSID="MeshCommandPost-RedTeam" sudo -E bash setup/setup-ap.sh
#    (Note: $RANDOM is NOT used as the fallback — inside command substitution it
#    inherits the parent's seed and returns the SAME number every call, which
#    would defeat the whole point. /dev/urandom is portable and actually random.)
AP_SSID="${AP_SSID:-MeshCommandPost-$(shuf -i 100-999 -n 1 2>/dev/null || od -An -N2 -tu2 /dev/urandom | awk 'NR==1{print $1%900+100}')}"

#    Channel: hardcoding 6 is a trap at a crowded venue (it's usually the most
#    congested channel in the room, and the resulting flakiness looks like app
#    bugs). Scan first and take the quietest of 1/6/11 unless told otherwise.
if [ -z "$WIFI_CHANNEL" ]; then
  echo "📡 Scanning for the least congested WiFi channel..."
  bash "$(dirname "$0")/pick-channel.sh" || true
  WIFI_CHANNEL="$(bash "$(dirname "$0")/pick-channel.sh" --quiet 2>/dev/null || echo 1)"
fi
echo "📶 Using SSID '$AP_SSID' on channel $WIFI_CHANNEL"

# Render the template (placeholders -> real values) and install it.
RENDERED="$(mktemp)"
sed -e "s/__SSID__/${AP_SSID}/" -e "s/__CHANNEL__/${WIFI_CHANNEL}/" \
  "$(dirname "$0")/hostapd.conf" > "$RENDERED"
sudo cp "$RENDERED" /etc/hostapd/hostapd.conf
rm -f "$RENDERED"

sudo cp "$(dirname "$0")/dnsmasq.conf" /etc/dnsmasq.conf
echo 'DAEMON_CONF="/etc/hostapd/hostapd.conf"' | sudo tee /etc/default/hostapd > /dev/null

# 5. Enable IP forwarding is NOT needed — this network has no internet uplink,
#    so we deliberately don't route packets anywhere else. Everything stays local.

# 6. Start the access point
sudo systemctl unmask hostapd
sudo systemctl restart hostapd
sudo systemctl restart dnsmasq

echo "✅ WiFi network '$AP_SSID' is live at 192.168.4.1 (channel $WIFI_CHANNEL)"

# 7. Let the (non-root) Node process bind port 80.
#    We deliberately do NOT run the whole server as root. Two supported ways to
#    bind the privileged port 80:
#      (a) systemd unit with AmbientCapabilities=CAP_NET_BIND_SERVICE  <-- recommended,
#          used by setup/mesh-command-post.service. Narrowest scope, auto-restart.
#      (b) setcap on the node binary, for a quick manual foreground run without sudo.
#    We apply (b) here so the manual start below works, and print how to enable (a).
NODE_BIN="$(command -v node)"
echo "🔐 Granting cap_net_bind_service to $NODE_BIN (so it can bind :80 without root)..."
sudo setcap 'cap_net_bind_service=+ep' "$NODE_BIN" || \
  echo "   (setcap failed — you can still run on port 3000, or use the systemd unit)"

cat <<EOF

────────────────────────────────────────────────────────────────────────
Recommended: run as an auto-restarting service (survives crashes mid-demo)

  sudo useradd --system --create-home --shell /usr/sbin/nologin mesh 2>/dev/null || true
  sudo cp "$(cd "$(dirname "$0")" && pwd)/mesh-command-post.service" /etc/systemd/system/
  # edit WorkingDirectory/ExecStart in that file if the repo isn't at /home/pi/mesh-command-post
  sudo systemctl daemon-reload
  sudo systemctl enable --now mesh-command-post
  systemctl status mesh-command-post          # verify it's running
  journalctl -u mesh-command-post -f          # follow logs

Also print the QR join sheet once the server is up and tape it to the Pi:
  open  http://192.168.4.1/qr   (or just browse there from a joined phone)
────────────────────────────────────────────────────────────────────────

EOF

echo "🚀 Starting the app server on port 80 (foreground, for a quick test)..."
echo "   Ctrl-C to stop; use the systemd service above for the real demo."
cd "$(dirname "$0")/../server"
PORT=80 AP_IP=192.168.4.1 node index.js

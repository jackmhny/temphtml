# Helium, with the sound coming from the laptop

The **Helium (Laptop Audio)** desktop entry launches a small wrapper named
`helium-laptop-audio`. The wrapper sets:

```sh
PULSE_SERVER=tcp:100.64.0.9
```

and then replaces itself with Helium. Helium inherits that environment variable,
so its PulseAudio-compatible output goes to `saxtonhale` over Tailscale instead
of the local speakers. The wrapper accepts an existing `PULSE_SERVER` override
and can find Helium as `helium`, `Helium`, or a matching Flatpak application.

On the laptop, `laptop-audio-receiver.service` starts after
`pipewire-pulse.service`. Its receiver script uses `pactl` to load
`module-native-protocol-tcp`, listening on the laptop's Tailscale address. The
module allows anonymous protocol authentication, but binds to `100.64.0.9` and
limits clients to Tailscale's `100.64.0.0/10` address range. The service keeps
the module loaded and unloads it when stopped.

The result is a direct PulseAudio-protocol stream carried inside Tailscale's
encrypted network:

**desktop shortcut → wrapper → Helium → Tailscale → PipeWire/PulseAudio on the laptop → laptop speakers**

It is not an SSH tunnel, Bluetooth connection, or system-wide output switch.
Only the Helium process inherits the remote audio server setting. The one brittle
part is the hard-coded `100.64.0.9`; if the laptop's Tailscale address changes,
both the launcher and receiver configuration need to change.

# Misma microphone access

The Voice settings page includes a microphone test and local input-level meter. This feature requests microphone access only after the user selects **Enable microphone** and, when permission is not already granted, confirms the soft prompt.

The microphone stream is held by `src/lib/use-microphone.ts`. It is used only to calculate a local audio level. Misma does not record, transcribe, or upload this audio. The microphone is explicitly stopped when the user selects Stop, the component unmounts, the page is hidden, the page is navigated away from, or the active track ends.

## Files

1. `src/lib/use-microphone.ts` — permission query and change listener, stream lifecycle, device selection, mute state, error mapping, and Web Audio meter.
2. `src/components/microphone-access-panel.tsx` — accessible permission, recovery, device, and meter UI.
3. `src/components/microphone-access.css` — panel and dialog styles.
4. `src/routes/dashboard.tsx` — mounts the panel in **Settings → Voice**.
5. `tests/project-config.test.mjs` — regression coverage for the permission and cleanup requirements.

## Deployment requirements

- Serve the site over HTTPS. `http://localhost` is allowed for local development.
- If this page is embedded in an iframe, the parent page must explicitly grant microphone access:

  ```html
  <iframe src="https://your-site.example" allow="microphone"></iframe>
  ```

- If the server sends a Permissions-Policy header, allow the page's own origin:

  ```http
  Permissions-Policy: microphone=(self)
  ```

  Do not send a conflicting `microphone=()` policy. If the feature is intentionally delegated to a cross-origin iframe, list that exact trusted origin in the policy and use the iframe `allow` attribute.

## Browser behavior and privacy

- The Permissions API query is attempted before displaying the soft prompt. Browsers that do not support querying the `microphone` permission name fall back to the soft prompt and the native `getUserMedia` permission flow.
- Permission changes are observed where the browser exposes a `PermissionStatus` change event. If access is denied, the app does not attempt to re-open the native prompt; the user must change the browser's site setting.
- Device labels are loaded after permission is granted. The device selector is keyboard accessible.
- Switching devices stops the current stream before requesting the next one. This avoids overlapping active streams, including on iOS Safari where microphone capture should be treated as a single active stream.
- The analyser is connected only to the microphone source, not to the audio output. It never plays microphone input through the speakers.

## Test checklist

1. **Allow:** Open Settings → Voice, select Enable microphone, choose Continue, then Allow in the browser prompt. Speak and confirm that the input bar moves. The browser's microphone indicator should be visible while active.
2. **Cancel:** Select Enable microphone and then Cancel in the soft prompt. The native prompt should not appear and the microphone should remain off.
3. **Block:** Block microphone access in the browser prompt. Confirm that the recovery instructions appear and that the app does not repeatedly call `getUserMedia`.
4. **No device:** Disconnect or disable all microphones, then try again. The UI should report that no microphone was found.
5. **Device in use:** Use another application or tab that exclusively locks the microphone, then try again. If the operating system/browser reports the device as unreadable, the UI explains that the microphone may be in use.
6. **Mute and stop:** Mute the microphone and confirm the meter falls to zero; stop it and confirm the browser's microphone-use indicator turns off.
7. **Hidden page/navigation:** Start the test, switch tabs or navigate away, and confirm the stream is stopped.

## Reset a blocked permission

- **Chrome (desktop):** Open the site, select the site information icon beside the address bar → Site settings → Microphone → Allow. Reload if prompted.
- **Firefox:** Select the permissions icon beside the address bar and remove the blocked microphone permission with its X. Alternatively open Page Info → Permissions and set Use the Microphone to Allow.
- **Safari on Mac:** Safari → Settings → Websites → Microphone, then set this website to Ask or Allow.
- **Safari on iPhone/iPad:** Settings → Apps → Safari → Microphone, allow access, then return to Safari and reload the page. The browser may also require a fresh user tap before opening the microphone.

Browser and operating-system menu names can vary by version and device.


## Chat voice notes

The dashboard message-bar microphone records audio locally with the browser's MediaRecorder API. While recording, the composer shows a live waveform and a stop control. Stopping the recording creates an audio attachment with an in-composer playback control; the rightmost composer control then changes to the Send arrow. The audio is submitted to Misma when the user presses Send.

The chat Edge Function reads the audio from the signed-in workspace's private `misma-media` bucket and sends it to Groq's transcription endpoint (`https://api.groq.com/openai/v1/audio/transcriptions`) using the server-side `GROQ_API_KEY` secret. The default model is `whisper-large-v3-turbo`, configurable with `GROQ_TRANSCRIPTION_MODEL`. The transcript is added to the user's chat prompt and the original audio remains attached and playable in the conversation. Groq currently documents support for WebM, MP4, M4A, OGG, WAV, MP3 and FLAC audio files, and the transcription endpoint currently supports `whisper-large-v3` and `whisper-large-v3-turbo`. <https://console.groq.com/docs/speech-to-text>

The separate Settings microphone test remains local-only and never records or uploads audio. The chat voice-note recording is a separate, user-initiated feature; it is kept in the browser until the user stops the recording and submits it with Send.

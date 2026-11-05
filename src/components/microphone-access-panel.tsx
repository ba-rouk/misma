import { useMicrophoneAccess } from "../lib/use-microphone";

export function MicrophoneAccessPanel() {
  const microphone = useMicrophoneAccess();
  const isBusy = microphone.state === "requesting";

  return (
    <section className="misma-mic-panel" aria-labelledby="misma-mic-title" aria-busy={isBusy}>
      <div className="misma-mic-panel-heading">
        <div>
          <h4 id="misma-mic-title">Microphone access</h4>
          <p>Check that your microphone works before using voice features.</p>
        </div>
        <span className={"misma-mic-state is-" + microphone.state}>
          {microphone.state === "active" ? "Live" : microphone.state === "requesting" ? "Requesting" : microphone.state}
        </span>
      </div>

      <p className="misma-mic-status" role="status" aria-live="polite" aria-atomic="true">
        {microphone.message}
      </p>

      {microphone.state === "active" && (
        <div className="misma-mic-live">
          <div className="misma-mic-meter-row">
            <span>Microphone input level</span>
            <span>{microphone.isMuted ? "Muted" : microphone.level + "%"}</span>
          </div>
          <div
            className="misma-mic-meter"
            role="meter"
            aria-label="Microphone input level"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={microphone.isMuted ? 0 : microphone.level}
          >
            <span style={{ width: (microphone.isMuted ? 0 : microphone.level) + "%" }} />
          </div>
          {!microphone.meterAvailable && (
            <p className="misma-mic-help">Your browser granted microphone access, but its audio level meter is unavailable.</p>
          )}
          <div className="misma-mic-actions">
            <button type="button" className="aichat-action-btn secondary" onClick={microphone.toggleMute}>
              {microphone.isMuted ? "Unmute microphone" : "Mute microphone"}
            </button>
            <button type="button" className="aichat-action-btn" onClick={microphone.stop}>
              Stop microphone
            </button>
          </div>
        </div>
      )}

      {microphone.devices.length > 0 && (
        <label className="misma-mic-device">
          Microphone device
          <select
            className="aichat-select"
            value={microphone.selectedDeviceId}
            disabled={microphone.state === "active" || isBusy}
            onChange={(event) => microphone.setSelectedDeviceId(event.target.value)}
          >
            <option value="">Default microphone</option>
            {microphone.devices.map((device, index) => (
              <option key={device.deviceId || "audio-input-" + index} value={device.deviceId}>
                {device.label || "Microphone " + (index + 1)}
              </option>
            ))}
          </select>
          <small>Device names are provided by your browser after microphone permission is granted. Stop the live check before changing devices.</small>
        </label>
      )}

      {microphone.promptVisible && (
        <div className="misma-mic-soft-prompt" role="group" aria-label="Microphone permission explanation">
          <p>Misma needs microphone access only to check your input level. The sound stays in this browser. It will not be recorded, saved, or uploaded.</p>
          <div className="misma-mic-actions">
            <button type="button" className="aichat-action-btn" onClick={microphone.continueAfterPrompt}>
              Continue
            </button>
            <button type="button" className="aichat-action-btn secondary" onClick={microphone.cancelPrompt}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {microphone.state === "idle" && !microphone.promptVisible && (
        <button type="button" className="aichat-action-btn" onClick={() => void microphone.begin()}>
          Start microphone check
        </button>
      )}

      {isBusy && (
        <button type="button" className="aichat-action-btn secondary" disabled>
          Requesting microphone…
        </button>
      )}

      {microphone.state === "denied" && (
        <div className="misma-mic-recovery" role="alert">
          <strong>Re-enable microphone access in your browser</strong>
          <ol>
            <li><b>Chrome:</b> Select the site controls icon beside the address bar, open Site settings, set Microphone to Allow, then reload this page.</li>
            <li><b>Firefox:</b> Select the permissions icon beside the address bar, clear the blocked microphone permission, reload, and choose Allow when asked.</li>
            <li><b>Safari:</b> Open Safari Settings → Websites → Microphone, find this website, and choose Allow. On iPhone/iPad, open Settings → Apps → Safari → Microphone and permit access.</li>
          </ol>
          <button type="button" className="aichat-action-btn secondary" onClick={() => void microphone.begin()}>
            Check permission again
          </button>
        </div>
      )}

      {microphone.state === "unavailable" && (
        <div className="misma-mic-recovery" role="alert">
          <strong>Microphone unavailable</strong>
          <p>{microphone.message}</p>
          <p>Hosted websites must use HTTPS. If this page is inside an iframe, the iframe must include <code>allow="microphone"</code>, and the parent site's Permissions-Policy must permit this app's origin.</p>
          <button type="button" className="aichat-action-btn secondary" onClick={() => void microphone.begin()}>
            Try again
          </button>
        </div>
      )}

      {microphone.state === "error" && (
        <div className="misma-mic-recovery" role="alert">
          <p>{microphone.message}</p>
          <button type="button" className="aichat-action-btn secondary" onClick={() => void microphone.begin()}>
            Try again
          </button>
        </div>
      )}

      <p className="misma-mic-privacy">
        Privacy: this check only reads the live input level on your device. Misma does not record, store, stream, or upload microphone audio.
      </p>
    </section>
  );
}

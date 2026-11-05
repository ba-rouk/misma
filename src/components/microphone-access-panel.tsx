import { useMicrophone, type MicrophoneState } from "../lib/use-microphone";
import "./microphone-access.css";

const STATE_LABELS: Record<MicrophoneState, string> = {
  idle: "Not active",
  requesting: "Requesting access",
  active: "Microphone live",
  denied: "Access blocked",
  unavailable: "Unavailable",
  error: "Microphone error",
};

export function MicrophoneAccessPanel() {
  const microphone = useMicrophone();
  const isActive = microphone.state === "active";
  const isDenied = microphone.state === "denied";
  const isUnavailable = microphone.state === "unavailable";
  const isError = microphone.state === "error";

  return (
    <div className="misma-mic-panel">
      <div className="misma-mic-heading">
        <div>
          <h4>Microphone access</h4>
          <p>Test your input device and check its live audio level.</p>
        </div>
        <span className={\`misma-mic-status is-\${microphone.state}\`} aria-live="polite">
          <span className="misma-mic-status-dot" aria-hidden="true" />
          {STATE_LABELS[microphone.state]}
        </span>
      </div>

      <p className="misma-mic-privacy">
        Your microphone is used only while this test is active. Audio is analysed locally for the level meter; Misma does not record or upload it.
      </p>

      {isActive ? (
        <div className="misma-mic-active">
          {microphone.devices.length > 0 && (
            <div className="misma-mic-device">
              <label htmlFor="misma-mic-device-select">Input device</label>
              <select
                id="misma-mic-device-select"
                className="aichat-select"
                value={microphone.selectedDeviceId}
                onChange={(event) => void microphone.selectDevice(event.target.value)}
                aria-label="Select microphone input device"
              >
                {microphone.devices.map((device, index) => (
                  <option key={device.deviceId || \`microphone-\${index}\`} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="misma-mic-meter-wrap">
            <div className="misma-mic-meter-label">
              <span>Input level</span>
              <span>{microphone.muted ? "Muted" : "Live"}</span>
            </div>
            <div
              className="misma-mic-meter"
              role="meter"
              aria-label="Microphone input level"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(microphone.level * 100)}
            >
              <span style={{ width: \`\${Math.round(microphone.level * 100)}%\` }} />
            </div>
            <p className="misma-mic-meter-help">Speak near the microphone to see the level move. Nothing is saved.</p>
          </div>

          <div className="misma-mic-actions">
            <button type="button" className="aichat-action-btn secondary" onClick={microphone.toggleMute} aria-pressed={microphone.muted}>
              {microphone.muted ? "Unmute microphone" : "Mute microphone"}
            </button>
            <button type="button" className="aichat-action-btn" onClick={microphone.stop}>
              Stop microphone
            </button>
          </div>
        </div>
      ) : (
        <div className="misma-mic-actions">
          <button
            type="button"
            className="aichat-action-btn"
            onClick={() => void microphone.start()}
            disabled={microphone.state === "requesting" || !microphone.permissionKnown}
          >
            {microphone.state === "requesting" ? "Requesting…" : !microphone.permissionKnown ? "Checking permission…" : "Enable microphone"}
          </button>
          {microphone.state === "idle" && microphone.permission === "granted" && (
            <span className="misma-mic-inline-note">Permission is already allowed. Your microphone is not live until you start it.</span>
          )}
        </div>
      )}

      {microphone.state === "requesting" && (
        <p className="misma-mic-feedback" role="status" aria-live="polite">
          Waiting for the browser to open your microphone. Choose Allow in the browser prompt.
        </p>
      )}

      {(isDenied || isUnavailable || isError) && (
        <div className={\`misma-mic-feedback is-\${microphone.state}\`} role="alert" aria-live="assertive">
          <strong>{isDenied ? "Allow microphone access" : isUnavailable ? "Microphone unavailable" : "Check your microphone"}</strong>
          <p>{microphone.errorMessage}</p>

          {isDenied && (
            <div className="misma-mic-recovery">
              <p>A website cannot show the browser's permission prompt again after access has been blocked. Change the site permission, return here, then select “Check permission again”.</p>
              <details>
                <summary>Chrome</summary>
                <ol>
                  <li>Open this website and select the site information icon beside the address bar.</li>
                  <li>Open Site settings and set Microphone to Allow.</li>
                  <li>Return to Misma and check permission again. Reload the page if the browser asks you to.</li>
                </ol>
              </details>
              <details>
                <summary>Firefox</summary>
                <ol>
                  <li>Select the permissions icon beside the address bar.</li>
                  <li>Remove the blocked microphone permission with its X, or open Page Info → Permissions and set Use the Microphone to Allow.</li>
                  <li>Return to Misma and check permission again.</li>
                </ol>
              </details>
              <details>
                <summary>Safari on Mac</summary>
                <ol>
                  <li>Choose Safari → Settings → Websites → Microphone.</li>
                  <li>Find this website and choose Ask or Allow.</li>
                  <li>Return to Misma and check permission again.</li>
                </ol>
              </details>
              <details>
                <summary>Safari on iPhone or iPad</summary>
                <ol>
                  <li>Open Settings → Apps → Safari → Microphone.</li>
                  <li>Allow microphone access, then return to Safari and reload this website.</li>
                  <li>Check permission again in Misma.</li>
                </ol>
              </details>
              <button type="button" className="aichat-action-btn secondary" onClick={() => void microphone.checkPermissionAgain()}>
                Check permission again
              </button>
            </div>
          )}
        </div>
      )}

      <p className="misma-mic-footnote">
        Requires HTTPS outside localhost. If Misma is embedded in an iframe, the parent page must grant <code>allow="microphone"</code>. The microphone permission policy must also allow this page.
      </p>

      {microphone.softPromptOpen && (
        <div className="misma-mic-dialog-backdrop">
          <div
            className="misma-mic-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="misma-mic-dialog-title"
            aria-describedby="misma-mic-dialog-description"
          >
            <span className="misma-mic-dialog-icon" aria-hidden="true">♫</span>
            <h4 id="misma-mic-dialog-title">Allow microphone access?</h4>
            <p id="misma-mic-dialog-description">
              Misma needs microphone access only to test your input level. Your audio stays in this browser and is not recorded, transcribed, or uploaded.
            </p>
            <div className="misma-mic-actions">
              <button type="button" className="aichat-action-btn secondary" onClick={microphone.cancelPrompt}>
                Cancel
              </button>
              <button type="button" className="aichat-action-btn" onClick={() => void microphone.continueStart()}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { Button } from "./glass-ui";

export type PluginPermissionLevel = "always_ask" | "read_only" | "low_risk" | "all_actions";
const options: Array<{ value: PluginPermissionLevel; title: string; description: string; risk?: string }> = [
  { value: "always_ask", title: "Always ask", description: "Misma will ask before reading or making changes." },
  { value: "read_only", title: "Allow read actions", description: "Misma can read without asking, but will ask before making changes." },
  { value: "low_risk", title: "Allow low-risk actions", description: "Misma can automatically approve low-risk actions but will ask before sensitive changes.", risk: "DEFAULT" },
  { value: "all_actions", title: "Allow all actions", description: "Misma won't ask before reading or taking action. This comes with elevated risk.", risk: "ELEVATED RISK" },
];
export function PluginPermissionChoices({ storageKey }: { storageKey: string }) {
  const [value, setValue] = useState<PluginPermissionLevel>("low_risk");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved && options.some((item) => item.value === saved)) setValue(saved as PluginPermissionLevel);
    } catch { /* Keep the safe default if storage is unavailable. */ }
  }, [storageKey]);
  function choose(next: PluginPermissionLevel) {
    setValue(next);
    try { window.localStorage.setItem(storageKey, next); } catch { /* The current selection still works for this view. */ }
  }
  return <div className="misma-plugin-permission-choices">
    <div className="misma-plugin-permission-options" role="radiogroup" aria-label="Plugin action permission level">
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" aria-checked={value === option.value} className={"misma-plugin-permission-option" + (value === option.value ? " is-selected" : "")} onClick={() => choose(option.value)}>
          <span className="misma-plugin-permission-option-copy">
            <strong>{option.title}</strong>
            <small>{option.description}</small>
            {option.risk && <em className={option.risk === "DEFAULT" ? "is-default" : "is-risk"}>{option.risk}</em>}
          </span>
          <span className="misma-plugin-permission-radio" aria-hidden="true">{value === option.value ? <i /> : null}</span>
        </button>
      ))}
    </div>
    <p className="misma-plugin-permission-note">Choose when Misma should ask for permission when using this plugin.</p>
    <Button variant="secondary" onClick={() => { setValue("low_risk"); try { window.localStorage.removeItem(storageKey); } catch { /* Ignore unavailable storage. */ } }}>Reset to default</Button>
  </div>;
}

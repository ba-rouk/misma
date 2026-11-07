# Misma microphone permission dialog

The dashboard chat and website widget use a Misma-owned permission dialog before starting microphone dictation or speech mode when the browser reports `prompt` or `denied`. The widget dialog is rendered in the widget's Shadow DOM and does not depend on host-page styles.

The two Allow actions both call the browser's `getUserMedia({ audio: true })` API directly from the button click. Web pages cannot instruct browsers to persist a grant for one choice and make it temporary for another; the browser decides whether a grant is remembered. Misma does not claim permission is granted until `getUserMedia` resolves successfully. The stream used for the permission check is stopped immediately, and the actual dictation or speech engine starts afterward.

Selecting **Never allow** stores only a Misma-side preference in localStorage. It does not modify browser site settings. Selecting either Allow action after that removes the Misma-side preference. Closing with Escape or Got it does not save a preference.

## Browser and device test matrix

Run each scenario on both the dashboard and, where listed, the customer website widget.

| Browser / surface | Default or prompt | Granted | Blocked |
| --- | --- | --- | --- |
| Chrome Android — dashboard | Reset site permission, tap the composer mic and voice button. Confirm the dark green Misma dialog appears and both Allow options lead to the browser permission flow. | Grant access, refresh, tap both entry points. Confirm the Misma dialog is skipped and recording starts. | Block access, tap either entry point, choose an Allow option. Confirm the blocked help state appears with Android-specific instructions. |
| Desktop Chrome — dashboard | Reset permission and test both buttons. Confirm three full-width choices and Escape dismissal. | Set Microphone to Allow, refresh and confirm the custom dialog is skipped. | Set Microphone to Block, then retry from Misma. Confirm blocked help and desktop Chrome instructions. |
| Firefox — dashboard | Test the browser's native prompt fallback where the microphone Permissions API is not exposed. | Grant microphone, refresh and confirm dictation / voice mode starts. | Block microphone and confirm the blocked help screen explains Firefox permissions. |
| Safari iOS — dashboard | Test on an HTTPS origin. Safari may not expose microphone permission queries, so verify the direct getUserMedia fallback. | Allow microphone in the iOS/Safari permission controls and retry. | Deny access and confirm the fallback reports the blocked state with iOS-specific steps. |
| schoolsize.netlify.app — widget | Load the unchanged Misma widget script, reset this host's microphone permission, open chat and tap mic / voice. Confirm the dialog stays inside Shadow DOM, overlays the page, and is not affected by host CSS. | Grant access and verify dictation / voice response works. | Block access and verify the help view, no-device and insecure-context states where applicable. |

## Reset permissions between tests

- **Chrome Android:** open the site, tap the site controls icon beside the address bar, open Permissions or Site settings, set Microphone to Ask or Block, then reload. For a full reset, Chrome Settings > Site settings > Microphone > remove or reset the site entry.
- **Desktop Chrome:** open the site controls icon beside the URL > Site settings > Microphone. Change to Ask, Allow, or Block. Use Reset permissions to clear the origin's stored choices.
- **Firefox:** open the lock icon > Connection secure / Permissions and clear the microphone choice, or Settings > Privacy & Security > Permissions > Microphone > Settings… and remove the site entry.
- **Safari iOS:** Settings > Apps > Safari > Microphone (or Settings > Safari > Microphone on earlier iOS versions). Change the setting, then reload the site.
- **Misma-side Never allow preference:** in the browser console on the same origin run `localStorage.removeItem("misma_microphone_never_allow")` for the dashboard. For the website widget, remove the widget's site-scoped key beginning with `misma_mic_never_allow_` on the customer site. This only clears Misma's local preference; it does not change the browser permission.

## Expected error handling

- `NotAllowedError` / `PermissionDeniedError`: show the blocked help view; never pretend access was granted.
- `NotFoundError`: show the no-microphone message.
- Insecure context or `SecurityError`: explain that microphone access requires HTTPS.
- Cancel or Escape: close without changing the Misma preference.
- The temporary permission-check stream is always stopped after successful acquisition.

# CityWatch Debugging Session Report: 2026-03-15

This report details a series of critical bugs identified and resolved in the CityWatch application. The issues primarily affected the GPS override and tile-loading systems, leading to application instability and a poor user experience.

## Summary of Issues

1.  **Initial Load Failure:** Tiles failed to load on application start, requiring the user to toggle "Surveillance Mode" on and off to trigger a redraw.
2.  **Application Crash on GPS Jump:** When using the GPS override to jump to a new city, the application would frequently freeze permanently, with the tile counter stuck at `0/9`.
3.  **Delayed Tile Loading:** In cases where the app didn't crash, there was a significant delay (30-60 seconds) before tiles for the new city would begin to load.
4.  **"Revert to GPS" Failure:** The "revert to gps" button was non-functional when the user was stationary, as it passively waited for a new GPS signal that would often never arrive.
5.  **Incorrect Revert Destination:** A flaw in the logic would have caused the revert function, even if it worked, to return the user to their *previous pinned location* instead of their *actual physical location*.

---

## Issue 1: Initial Load Failure ("Surveillance Toggle" Bug)

*   **Symptom:** The map was blank on load. Tiles would only appear after toggling Surveillance Mode on, then off.
*   **Root Cause:** A typo (`ey` instead of `oy`) and a logical mismatch in the tile grid calculation. A function named `get2x2Tiles` was actually attempting to generate a 3x3 grid (and failing due to the typo), while the UI HUD expected a 9-tile grid (`tileTarget = 9`). This inconsistency broke the initial tile load.
*   **Fix:**
    1.  Corrected the typo in the tile generation loop.
    2.  Renamed the function to `get3x3Tiles` for clarity.
    3.  Ensured the call to this function and the corresponding `tileTarget` variable were aligned.

## Issue 2 & 3: Application Crash and Loading Delays

*   **Symptom:** App freezing completely after a GPS jump, or experiencing a long, unexplained pause before loading.
*   **Root Cause:** This was a complex race condition with two primary causes:
    1.  **Un-cleared Transit Polling:** The `setInterval` used to poll for Stockholm (SL) transit data was never cleared during a scene reset. When jumping to a new city (e.g., Dubai), this timer would continue running. It would request transit data for the new location, the server would return an HTML error page, and the app would crash when it tried to parse this HTML as JSON.
    2.  **No In-Flight Request Cancellation:** The `resetScene` function did not cancel pending `fetch` requests for the *old* city's tiles. The browser would wait for all of these now-irrelevant requests to complete or time out before starting the requests for the new city, causing the long, frustrating delay.
*   **Fix:**
    1.  **Robust `clearTransit`:** The `clearTransit` function was rewritten to explicitly find and destroy the `transitPollInterval` timer using `clearInterval`. It also now properly disposes of all Three.js objects related to the transit layer.
    2.  **Abortable Fetch:** The tile loading logic was upgraded to use the `AbortController` API. A central controller now manages all tile requests. When `resetScene` is called, it immediately calls `.abort()` on the controller, instantly cancelling all old network requests and allowing the new ones to start without delay.

## Issue 4 & 5: "Revert to GPS" Failure & Incorrect Destination

*   **Symptom:** Clicking "revert to gps" did nothing if the user was stationary. The UI button would update, but the map view remained on the pinned location.
*   **Root Cause:**
    1.  **Passive Logic:** The function was designed to wait for a *new* GPS signal from the device before acting. If the device was stationary, no new signal was sent, and the function never completed.
    2.  **State Contamination:** The app lacked a clean, dedicated variable to store the user's *real* physical location. It was using the same variables for both the map's viewport and the user's GPS, so the "last known position" was always the last place the user had pinned, not where their device was.
*   **Fix:**
    1.  **Dedicated Real GPS State:** Introduced `lastRealLat` and `lastRealLon` variables. These are *only* updated by the device's `geolocation` API, creating a reliable source of truth for the user's physical location.
    2.  **Immediate, Active Revert:** The `revertGpsOverride` function was rewritten to be an *active* function. It now immediately calls `resetScene` using the newly stored `lastRealLat` and `lastRealLon`, ensuring the revert is instant and always returns to the correct physical location.

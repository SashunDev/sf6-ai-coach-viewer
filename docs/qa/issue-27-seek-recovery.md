# PR #28 paused-seek recovery

Issue #27. [Direct Review](https://github.com/SashunDev/sf6-ai-coach-viewer/pull/28#pullrequestreview-5949689031).
Reviewed HEAD: `dccaa8822cd6c2b4afc5c6e4a6a05b1cf49beaad`.
Base/main at start: `611039fc39450e5a411b698fcb41a58f1c56da41`.

Both players record the paused-seek plan before calling `seekTo`. A PLAYING notification or the existing one-second check can request a pause for the current plan if the API reports PLAYING. Recovery is limited to once per plan and to 2.5 seconds from the seek. This allows a BUFFERING → PLAYING event after the one-second check while bounding how long recovery can react to a play event. The IFrame event does not identify whether a play originated from the seek or the iframe's internal controls. Explicit clicks on the viewer's play/pause button invalidate the plan before issuing their command.

New seeks supersede the previous plan. Video selection, player clear or replacement, mode exit and player errors invalidate pending owner recovery as applicable. Guest player errors invalidate guest recovery. The requested time is still approximate.

Local Node: 76 PASS. Owner and guest mocks control state events and seek checks separately. They cover synchronous and deferred PLAYING events, BUFFERING at the checkpoint followed by PLAYING, an API state change without a notification, and explicit Play after rapid seeks. They also check invalidation on errors and owner video/player changes. A shared helper test verifies expiry and that duplicate attempts cannot repeat the pause command while the player reports PLAYING. Tests added before the fix exposed the BUFFERING → PLAYING regression in both views and guest error-status overwrite.

Local Python: 126 PASS with the existing test dependency directory on PYTHONPATH, including mocked Pages/standalone builds. Changed JavaScript files passed syntax checks and the correction passed `git diff --check`. Local Chromium exited before rendering: the startup log reports `socket() failed: Operation not permitted` in the process singleton. Final-head CI outcomes are recorded in the PR conversation.

Owner Acceptance remains pending for real IFrame API communication, iPhone Safari playback and seek, guest CSP compatibility with the live API, and displayed-frame behavior. The P2 correction uses synthetic players and approximate timestamps.

# Welcoming trip starting page implementation plan

Goal: reproduce the approved cream, photo-led desktop/mobile starting screen with the existing planner form and real site photos.
Architecture: a small server-rendered view module transforms the chat-enabled V4 starting screen only. Preserve form/input/submit/status/edit IDs, stay inputs, result mount, request handlers and bilingual behavior. Keep long help accessible in a disclosure.
Approved spec: user's desktop/mobile mockup approved in this chat, followed by explicit implementation, live deployment and testing authorization.

- [ ] Add render/integration tests for unique form/result mounts, real asset existence, example request wiring and valid generated scripts.
- [ ] Add trip-start-page.js view/styles; wire after existing chat/workspace styles. Reuse data-t3-request for photo examples, selecting the page language and current town.
- [ ] Verify mobile 390px and desktop 1440px: initial page, typed request, photo examples, chat edits, save/share regression, optional help. Review diff independently.
- [ ] Commit/merge/deploy authorized changes, wait for matching Railway success and repeat live browser checks.

Review focus: town-specific links must not submit another town; French examples must submit French; one form/input/result mount; loading/error instructions remain visible; starting-screen styles must not change results.

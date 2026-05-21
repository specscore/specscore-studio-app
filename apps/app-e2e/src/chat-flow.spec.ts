import { test } from '@playwright/test';

// Pending until Plan F Task 8 enables a live runner that can serve the chat
// websocket end-to-end. Re-enable by removing `.skip` once a test runner is
// reachable from CI.
test.skip('chat: start session, send a message, receive output, end session', async () => {
    // Implementation deferred to Task 8 live-run validation.
});

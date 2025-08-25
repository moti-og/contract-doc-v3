moti explained to ai exactly how to fix it and it explained it back perfectly. but didn't do it yet:

ELI5 analysis
The add‑in and the web viewer live in different sandboxes and have different SDKs. They don’t “hand a file” to each other directly; both talk to the server.
1) Why can’t the add‑in “receive a document format” from the web?
It can receive a document, but only as bytes (base64/OOXML) through Office.js, not as “a downloaded file” or a prefilled file input.
The web viewer’s export() triggers a browser download to your disk. The add‑in cannot read your local Downloads folder (sandbox/security).
So the correct path is: add‑in fetches the DOCX from the server → converts to base64 → opens with createDocument or insertFileFromBase64. That’s how it “receives a document.”
2) How do we send data from the add‑in to the web, and why is it different?
Add‑in → server: the add‑in gathers bytes (Office.js returns base64) and POSTs to our /api/v1/save-progress. The server writes the working copy and bumps the revision.
Web → server: the web viewer subscribes to SSE and reloads the working DOCX when the server says it changed.
There’s no direct add‑in ↔ web pipe. Both sides talk to the server. They’re “different” because:
Office.js exposes programmatic bytes (good for uploads).
SuperDoc’s export() in our UMD triggers a download (good for user download, not for programmatic upload). Hence, web can’t easily push bytes; the add‑in can.
Practical takeaway
To get a doc “from the web into Word,” don’t try to pass a file from the web pane. Have the add‑in pull the DOCX from the server and open it. That’s symmetric with how the add‑in already saves back to the server, and it avoids browser download/security roadblocks.



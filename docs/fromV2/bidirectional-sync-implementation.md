# Bidirectional Real-Time Sync Implementation

## Overview

This document captures the key technical insights, functions, and troubleshooting methods that enabled successful bidirectional real-time synchronization between Word add-in and web viewer using SSE (Server-Sent Events) and document locking.

## Architecture Components

### 1. Server-Sent Events (SSE) Hub
**File:** `api-server.js`
**Key Functions:**
- `broadcastSSE(event)` - Broadcasts events to all connected clients
- SSE endpoint `/api/events` - Maintains persistent connections
- `sseConnections[]` array - Tracks active connections

### 2. Document State Management
**File:** `api-server.js`
**Key Variables:**
```javascript
let currentDocument = {
    id: null,
    filename: null, 
    filePath: null,
    lastUpdated: null
};

let documentState = {
    isCheckedOut: false,
    checkedOutBy: null,      // 'word' or 'web'
    checkedOutAt: null,
    checkedOutUser: null
};
```

### 3. API Endpoints for Sync
**File:** `api-server.js`
**Critical Endpoints:**
- `POST /api/checkout` - Lock document for editing
- `POST /api/save-progress` - Save without unlocking  
- `POST /api/checkin` - Save and unlock
- `POST /api/cancel-checkout` - Unlock without saving
- `GET /api/get-updated-docx` - Retrieve latest document content
- `GET /api/status` - Get current document and checkout state

## Key Functions That Enabled Bidirectional Sync

### Word Add-in Side (`src/taskpane/taskpane.html`)

#### 1. SSE Event Handler
```javascript
eventSource.onmessage = function(event) {
    const data = JSON.parse(event.data);
    
    if (data.type === 'document-checked-in') {
        fetchDocumentStatus();
        // Auto-reload content after web check-in
        if (data.checkinBy !== 'word') {
            loadDocumentContent();
        }
    } else if (data.type === 'document-saved') {
        // Auto-reload content after web saves (if viewing)
        if (data.savedBy !== 'word' && currentDocumentState.checkedOutBy !== 'word') {
            loadDocumentContent();
        }
    }
};
```

#### 2. Document Loading Function
```javascript
async function loadDocumentContent() {
    const response = await fetch('http://localhost:3001/api/get-updated-docx');
    const result = await response.json();
    
    if (result.docx) {
        await Word.run(async (context) => {
            context.document.body.clear();
            context.document.body.insertFileFromBase64(result.docx, Word.InsertLocation.start);
            await context.sync();
        });
    }
}
```

#### 3. Checkout with Content Loading
```javascript
async function checkoutDocument() {
    const response = await fetch('http://localhost:3001/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'word' })
    });
    
    if (response.ok) {
        await fetchDocumentStatus(); // Update UI state
        await loadDocumentContent(); // Load document content
    }
}
```

### Web Viewer Side (`viewer.html`)

#### 1. SuperDoc Content Extraction
```javascript
async function extractSuperdocContent() {
    if (currentSuperdoc?.exportEditorsToDOCX) {
        const exportResult = await currentSuperdoc.exportEditorsToDOCX();
        const blob = exportResult[0];
        
        // Convert blob to base64 using FileReader
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = function() {
                const base64 = reader.result.split(',')[1];
                resolve({ format: 'base64', data: base64 });
            };
            reader.readAsDataURL(blob);
        });
    }
    return null;
}
```

#### 2. Save with Content Extraction
```javascript
async function saveProgress() {
    const extractedContent = await extractSuperdocContent();
    
    const response = await fetch('http://localhost:3001/api/save-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            source: 'web',
            docx: extractedContent?.data,
            filename: currentDocumentState.currentDocument?.filename
        })
    });
}
```

## Critical Technical Insights

### 1. DOCX File Format Understanding
- **DOCX files ARE ZIP files** containing XML components
- Word's `insertFileFromBase64()` expects the entire ZIP structure
- SuperDoc's `exportEditorsToDOCX()` returns a ZIP blob (application/zip)
- **Key Lesson:** Don't try to extract `.docx` files from ZIP - the ZIP IS the DOCX

### 2. Base64 Conversion for Large Files
```javascript
// Chunked conversion to avoid stack overflow
const chunkSize = 0x8000; // 32KB chunks
for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
    base64 += btoa(String.fromCharCode(...chunk));
}
```

### 3. API Endpoint Separation
- `/api/document/:id` - For SuperDoc viewing (with Content-Disposition headers)
- `/api/document/:id/data` - For raw data fetching (no download headers)
- **Key Lesson:** Separate endpoints prevent unwanted browser downloads

### 4. SSE Event Conditions
Critical to check event source to prevent infinite loops:
```javascript
if (data.savedBy !== 'word' && currentDocumentState.checkedOutBy !== 'word') {
    loadDocumentContent(); // Only reload if change came from elsewhere
}
```

## Troubleshooting Methods That Worked

### 1. Incremental Debugging Strategy
**Approach:** Test each component in isolation
- Step 1: Verify SSE connection (`console.log` SSE events)
- Step 2: Test API endpoints individually (`fetch()` in console)  
- Step 3: Test document loading separately
- Step 4: Combine components

### 2. Console Debugging Patterns
**Effective Techniques:**
```javascript
// Override functions to add debugging
const originalEventSource = eventSource;
eventSource.onmessage = function(event) {
    console.log('🔍 SSE event received:', JSON.parse(event.data));
    // Original logic...
};

// Test API endpoints directly
fetch('http://localhost:3001/api/status').then(r => r.json()).then(console.log);
```

### 3. Server-Side Logging Analysis
**Key Pattern:** Match client-side events with server-side logs
- Client logs: `SSE event received: {type: 'document-saved'}`
- Server logs: `💾 Progress saved by web: filename.docx`
- **Missing server logs** indicated the root cause

### 4. Timestamp Debugging
**Critical Technique:** Compare timestamps across the flow
```javascript
console.log('API data timestamp:', apiData.lastUpdated);
console.log('Recent change timestamp:', recentChangeTimestamp);
// Mismatch revealed stale data issue
```

### 5. Data Flow Validation
**Effective Method:** Trace data at each step
1. SuperDoc content extraction
2. Base64 conversion  
3. API request body
4. Server-side file saving
5. API response to Word
6. Word document insertion

## Common Pitfalls and Solutions

### 1. Missing Document Content in Requests
**Problem:** Calling save endpoints without `docx` field
**Solution:** Always extract and include document content
```javascript
// ❌ Wrong - no content
body: JSON.stringify({ source: 'web', filename: 'doc.docx' })

// ✅ Correct - with content  
body: JSON.stringify({ 
    source: 'web', 
    docx: extractedContent?.data,
    filename: 'doc.docx' 
})
```

### 2. Office.js Context Issues
**Problem:** `Word` object undefined in wrong context
**Solution:** Ensure functions run in Word add-in context, not web viewer

### 3. Event Loop Prevention
**Problem:** Infinite SSE event loops
**Solution:** Check event source before triggering actions
```javascript
if (data.savedBy !== 'word') {
    // Only react to changes from other sources
}
```

### 4. File Size Limitations
**Problem:** Stack overflow with large base64 strings
**Solution:** Use chunked conversion or FileReader API

## Performance Considerations

### 1. SSE Connection Management
- Maintain single persistent connection per client
- Implement connection retry logic
- Clean up connections on client disconnect

### 2. Document Loading Optimization
- Only reload content when necessary (check timestamps)
- Use conditional loading based on checkout state
- Implement debouncing for rapid changes

### 3. Memory Management
- Clean up SuperDoc instances before creating new ones
- Limit SSE connection array size
- Use appropriate chunk sizes for large files

## Future Enhancements

### 1. Conflict Resolution
- Detect simultaneous edits
- Implement merge strategies
- Add user notification for conflicts

### 2. Offline Support  
- Cache documents locally
- Queue actions when offline
- Sync when connection restored

### 3. Multi-User Awareness
- Show active users
- Display cursor positions
- Real-time collaborative editing

## Key Takeaways

1. **Root Cause Analysis:** Most sync issues stem from missing data, not broken APIs
2. **Incremental Testing:** Test each component separately before combining
3. **Console Debugging:** Client-side and server-side logs must correlate
4. **Data Format Understanding:** Know the underlying file formats (DOCX = ZIP)
5. **Event Source Validation:** Prevent infinite loops with proper conditions
6. **Chunked Processing:** Handle large files safely to avoid browser limitations

The successful implementation proves that robust real-time bidirectional sync is achievable with careful attention to data flow, proper error handling, and systematic debugging approaches.
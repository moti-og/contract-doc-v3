# Word Add-in Infrastructure: Critical Lessons Learned

## Key Breakthrough: Office Generator

**❌ DON'T:** Manual registry edits, manifest uploads, sideloading  
**✅ DO:** Use `yo office` - Microsoft's official generator

---

## Actual Error Messages & Failures

### Registry Hell - What We Tried
```reg
[HKEY_CURRENT_USER\Software\Microsoft\Office\16.0\WEF\Developer]
"AllowUnsafeAddins"=dword:00000001
"LoadLooseManifests"=dword:00000001
```

**Result:** "Upload My Add-in" button disappeared entirely from Word.

### Cache Clearing Attempts
```bash
# Location: %LOCALAPPDATA%\Microsoft\Office\16.0\Wef\
# Deleted everything - add-in still wouldn't load
```

**Error Log:**
```
Trust settings for add-in have been corrupted
Manifest validation failed: Invalid source location
Unable to load add-in from untrusted source
```

### Manual Manifest Issues
```xml
<!-- Our broken manifest -->
<Id>12345678-1234-1234-1234-123456789012</Id>
<SourceLocation DefaultValue="http://localhost:3000/taskpane.html"/>
```

**Word Response:** Silent failure, add-in appears in ribbon but blank iframe.

---

## Office.js API Gotchas

### Wrong API Usage
```javascript
// ❌ This doesn't exist but documentation suggests it might
const base64 = doc.getFilePropertiesBase64();
```

**Error:**
```
TypeError: doc.getFilePropertiesBase64 is not a function
```

### Correct API Pattern
```javascript
// ✅ The working approach
const base64 = await new Promise((resolve, reject) => {
    Office.context.document.getFileAsync(Office.FileType.Compressed, (result) => {
        if (result.status === Office.AsyncResultStatus.Succeeded) {
            const file = result.value;
            file.getSliceAsync(0, (sliceResult) => {
                if (sliceResult.status === Office.AsyncResultStatus.Succeeded) {
                    resolve(sliceResult.value.data);
                    file.closeAsync();
                } else {
                    reject(new Error('Failed to get document slice'));
                }
            });
        } else {
            reject(new Error('Failed to get document file'));
        }
    });
});
```

### Import API Evolution
```javascript
// ❌ First attempt - wrong insertion method
doc.insertFileFromBase64(result.docx, Word.InsertLocation.replace);

// ✅ Working pattern
context.document.body.clear();
context.document.body.insertFileFromBase64(result.docx, Word.InsertLocation.start);
```

---

## SuperDoc Integration Pain Points

### Version Issues
```json
// ❌ Tried this first - doesn't exist
"@harbour-enterprises/superdoc": "^8.4.0"
```

**npm Error:**
```
npm error notarget No matching version found for @harbour-enterprises/superdoc@^8.4.0
```

### Working Version
```json
// ✅ Actual working version
"@harbour-enterprises/superdoc": "^0.14.19"
```

### Script Path Issues
```html
<!-- ❌ Broken in nested project structure -->
<script src="/node_modules/@harbour-enterprises/superdoc/dist/superdoc.umd.js"></script>
```

**Error:**
```
Failed to load resource: the server responded with a status of 404 (Not Found)
```

```html
<!-- ✅ Fixed path -->
<script src="./node_modules/@harbour-enterprises/superdoc/dist/superdoc.umd.js"></script>
```

### SuperDoc Export Complexity
```javascript
// SuperDoc export returns array with Blob at index 0
const docxResult = await currentSuperdoc.exportEditorsToDOCX();
console.log('Export result type:', typeof docxResult);
// Output: object
console.log('Is Array?', Array.isArray(docxResult));
// Output: true
console.log('First element:', docxResult[0]);
// Output: Blob

// Handle chunked conversion for large files
const actualBlob = docxResult[0];
const arrayBuffer = await actualBlob.arrayBuffer();
const uint8Array = new Uint8Array(arrayBuffer);

let binaryString = '';
const chunkSize = 8192; // Prevent stack overflow
for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.slice(i, i + chunkSize);
    binaryString += String.fromCharCode.apply(null, chunk);
}
const base64 = btoa(binaryString);
```

---

## Port Management Lessons

### The Problem
```bash
# Office Generator defaults to 3000
npm start  # Port 3000

# Our API server 
node api-server.js  # Also wanted 3000
```

**Error:**
```
Error: listen EADDRINUSE: address already in use :::3000
```

### Solution - Strategic Port Allocation
```bash
# Port 3000: Office add-in (can't change - Office expects this)
npm start

# Port 3001: API server
node api-server.js

# Port 3002: Web viewer  
npx http-server . -p 3002 --cors
```

### Process Cleanup
```bash
# When ports get stuck
taskkill /f /im node.exe
# Successfully terminated 6 node processes
```

---

## Git Workflow Discoveries

### Failed Merge Attempt
```bash
git checkout main
git merge feature/sse-real-time-sync
# Auto-merging...
# CONFLICT (content): Merge conflict in package.json
```

**Lesson:** Clean up project structure before merging complex features.

### Directory Structure Chaos
```
Document project/
├── api-server.js              # Old version
├── taskpane.html              # Old version  
├── OpenGov-Contracts-Clean/
│   └── OpenGov Contracting/
│       ├── api-server.js      # New version
│       └── src/taskpane/taskpane.html  # New version
└── OpenGov Contracts/         # Another old copy
```

**Solution:** Flatten structure, move working files to root.

### Commit Message Evolution
```bash
# ❌ Vague
git commit -m "fix things"

# ✅ Descriptive with status indicators
git commit -m "FINAL FOUNDATION: Clear button text + Open New File feature

✅ Button text clarified: Save/Open from/to 'the Web' and 'Word' 
✅ Web viewer: 'Open New File' button for direct .docx upload
✅ Three workflows: Word→Web, Web→Word, Direct→Web
✅ All sync functions tested and working
✅ Ready for SSE implementation"
```

---

## Development Environment Gotchas

### Node.js Version Sensitivity
```bash
# This project worked with Node 18+
node --version
# v18.17.0

# Earlier versions had issues with SuperDoc dependencies
```

### Windows Path Issues
```javascript
// ❌ Unix paths don't work on Windows
const filePath = './uploads/doc.docx';

// ✅ Use Node.js path module
const path = require('path');
const filePath = path.join('./uploads', 'doc.docx');
```

### CORS Configuration
```javascript
// ❌ Basic CORS - not enough for Office.js
app.use(cors());

// ✅ Explicit origins for Office add-in
app.use(cors({
    origin: ['https://localhost:3000', 'http://localhost:3002'],
    credentials: true
}));
```

---

## Performance Lessons

### File Upload Size Limits
```javascript
// ❌ Default Express limit too small for DOCX
app.use(express.json());

// ✅ Increased limit for document uploads
app.use(express.json({ limit: '50mb' }));
```

### Memory Management
```bash
# Monitoring Node.js memory usage
ps aux | grep node
# node    1234  12.5  8.9  987654  456789
```

Large documents required chunked processing to avoid memory issues.

---

## Security Considerations

### Local Development Trust
Office Generator automatically handles:
- HTTPS certificates for localhost
- Manifest trust signatures
- Development security policies

### Production Deployment
```xml
<!-- Development manifest -->
<SourceLocation DefaultValue="https://localhost:3000/"/>

<!-- Production manifest -->  
<SourceLocation DefaultValue="https://your-domain.com/"/>
```

---

## Timeline Reality Check

**Week 1-2:** Manual setup attempts (Failed)  
**Week 3:** Registry debugging (Failed)  
**Week 4:** Office Generator discovery (Success in 1 day)  
**Week 5-6:** Feature development on stable foundation

**Key Insight:** The "failed" time taught us what doesn't work, making the solution more valuable.

---

## Working Architecture

```
Port 3000: Office Add-in Dev Server (webpack-dev-server)
Port 3001: Express API Server (document sync)
Port 3002: Static Web Server (SuperDoc viewer)

┌─────────────┐    HTTP/HTTPS    ┌─────────────┐
│ Word Add-in │◄────────────────►│ API Server  │
│   (3000)    │                  │   (3001)    │
└─────────────┘                  └─────────────┘
                                        ▲
                                        │
                                        ▼
                                 ┌─────────────┐
                                 │ Web Viewer  │
                                 │   (3002)    │
                                 └─────────────┘
```

**Next:** [API Integration Patterns](api-integration.md)
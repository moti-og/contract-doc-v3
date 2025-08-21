# Troubleshooting Guide: Common Issues & Solutions

## Word Add-in Not Loading

### Symptom: "Upload My Add-in" Button Missing
```
Word Ribbon → Insert → Add-ins → (no "Upload My Add-in" button)
```

**Diagnosis Commands:**
```powershell
# Check if developer mode is enabled
Get-ItemProperty "HKCU:\Software\Microsoft\Office\16.0\WEF\Developer" -Name "UseManifestForSideload" -ErrorAction SilentlyContinue
```

**Solution:** Switch to Office Generator (yo office) - manual registry edits rarely work.

### Symptom: Add-in Shows in Ribbon But Blank Content
**Browser Console (F12 in add-in):**
```
Failed to load resource: net::ERR_CONNECTION_REFUSED
TypeError: Office is not defined
Uncaught ReferenceError: Word is not defined
```

**Root Causes & Fixes:**
1. **Development server not running**
   ```bash
   # Terminal shows this is wrong:
   npm start
   # Error: listen EADDRINUSE: address already in use :::3000
   
   # Kill processes and restart
   taskkill /f /im node.exe
   npm start
   ```

2. **Wrong script loading order**
   ```html
   <!-- ❌ Wrong order -->
   <script src="taskpane.js"></script>
   <script src="https://appsforoffice.microsoft.com/lib/1/hosted/office.js"></script>
   
   <!-- ✅ Office.js must load first -->
   <script src="https://appsforoffice.microsoft.com/lib/1/hosted/office.js"></script>
   <script src="taskpane.js"></script>
   ```

### Symptom: Manifest Validation Errors
```bash
npm run validate
# Error: Invalid manifest file
# Line 15: Invalid DefaultValue for SourceLocation
```

**Common Issues:**
```xml
<!-- ❌ HTTP in production manifest -->
<SourceLocation DefaultValue="http://localhost:3000/taskpane.html"/>

<!-- ❌ Wrong port -->
<SourceLocation DefaultValue="https://localhost:3001/taskpane.html"/>

<!-- ✅ Correct for Office Generator -->
<SourceLocation DefaultValue="https://localhost:3000/taskpane.html"/>
```

## API Server Issues

### Symptom: CORS Errors
**Browser Console:**
```
Access to fetch at 'http://localhost:3001/api/upload' from origin 'https://localhost:3000' 
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header
```

**Diagnosis:**
```javascript
// Check your Express setup
app.use(cors()); // Is this line present?

// Check if server is responding
curl -I http://localhost:3001/api/health
```

**Solution:**
```javascript
// Add explicit CORS configuration
app.use(cors({
    origin: [
        'https://localhost:3000',  // Office add-in
        'http://localhost:3002',   // Web viewer
        'https://localhost:3002'   // Web viewer HTTPS
    ],
    credentials: true
}));
```

### Symptom: Request Entity Too Large
**Server Log:**
```
Error: request entity too large
    at readStream (/node_modules/raw-body/index.js:155:17)
```

**Cause:** Default Express limit is 100kb, DOCX files are often larger.

**Solution:**
```javascript
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
```

### Symptom: Port Already in Use
```bash
node api-server.js
# Error: listen EADDRINUSE: address already in use :::3001
```

**Diagnosis:**
```bash
# Find what's using the port
netstat -ano | findstr :3001
# TCP    127.0.0.1:3001    0.0.0.0:0    LISTENING    1234

# Kill specific process
taskkill /f /pid 1234

# Or kill all Node processes
taskkill /f /im node.exe
```

## SuperDoc Integration Issues

### Symptom: "SuperDocLibrary is not defined"
**Console Error:**
```
ReferenceError: SuperDocLibrary is not defined
    at loadSuperdoc (viewer.html:145:17)
```

**Diagnosis:**
```javascript
// Check if script loaded
console.log('SuperDoc available:', typeof SuperDoc);
console.log('SuperDocLibrary available:', typeof SuperDocLibrary);
```

**Common Path Issues:**
```html
<!-- ❌ Wrong path from nested directory -->
<script src="/node_modules/@harbour-enterprises/superdoc/dist/superdoc.umd.js"></script>

<!-- ❌ Missing relative path indicator -->
<script src="node_modules/@harbour-enterprises/superdoc/dist/superdoc.umd.js"></script>

<!-- ✅ Correct relative path -->
<script src="./node_modules/@harbour-enterprises/superdoc/dist/superdoc.umd.js"></script>
```

### Symptom: SuperDoc Version Not Found
```bash
npm install
# npm error notarget No matching version found for @harbour-enterprises/superdoc@^8.4.0
```

**Solution:**
```json
// Use working version
"@harbour-enterprises/superdoc": "^0.14.19"
```

### Symptom: Document Load Fails in SuperDoc
**SuperDoc Console:**
```
Failed to load document: 404 (Not Found)
Document processing error: Invalid DOCX format
```

**Diagnosis:**
```javascript
// Check if API endpoint is working
fetch('http://localhost:3001/api/current-document')
    .then(r => r.json())
    .then(data => console.log('API Response:', data));

// Check if file exists on server
const fs = require('fs');
console.log('File exists:', fs.existsSync(currentDocument.filePath));
```

**Common Issues:**
1. **Document not uploaded first**
   - Use Word add-in to "Save to the Web" before loading in SuperDoc

2. **Wrong content type**
   ```javascript
   // ❌ Generic content type
   res.setHeader('Content-Type', 'application/octet-stream');
   
   // ✅ Specific DOCX type
   res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
   ```

## Office.js API Issues

### Symptom: "getFilePropertiesBase64 is not a function"
**Error:**
```
TypeError: doc.getFilePropertiesBase64 is not a function
    at exportToAPI (taskpane.html:192:31)
```

**Cause:** This method doesn't exist in Office.js API.

**Solution:** Use the correct document extraction pattern:
```javascript
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

### Symptom: "insertFileFromBase64 is not a function"
**Error:**
```
TypeError: doc.insertFileFromBase64 is not a function
    at importFromAPI (taskpane.html:245:17)
```

**Solution:** Use correct Word API:
```javascript
await Word.run(async (context) => {
    context.document.body.clear();
    context.document.body.insertFileFromBase64(result.docx, Word.InsertLocation.start);
    await context.sync();
});
```

## File Upload Issues

### Symptom: Large Files Cause Memory Errors
**Server Crash:**
```
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
```

**Cause:** Base64 conversion loads entire file into memory.

**Solution:** Implement chunked processing:
```javascript
// For large Uint8Arrays
let binaryString = '';
const chunkSize = 8192;
for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.slice(i, i + chunkSize);
    binaryString += String.fromCharCode.apply(null, chunk);
}
const base64 = btoa(binaryString);
```

### Symptom: File Upload Hangs
**Network Tab:** Request shows "Pending" forever.

**Diagnosis:**
```javascript
// Add timeout to requests
const controller = new AbortController();
setTimeout(() => controller.abort(), 30000);

const response = await fetch('/api/upload', {
    method: 'POST',
    signal: controller.signal,
    body: JSON.stringify(data)
});
```

## Development Environment Issues

### Symptom: Changes Not Reflected
**Steps Taken:**
1. Modified `taskpane.html`
2. Saved file
3. Refreshed Word add-in
4. No changes visible

**Solutions (in order of likelihood):**
1. **Hard refresh add-in:** Ctrl+F5 in add-in pane
2. **Restart dev server:** Stop `npm start`, restart
3. **Clear Word cache:** Close Word completely, reopen
4. **Check file path:** Ensure editing correct file in nested structure

### Symptom: Multiple Node Processes Running
```bash
tasklist | findstr node
# node.exe    1234  Console    1     45,678 K
# node.exe    5678  Console    1     32,145 K  
# node.exe    9012  Console    1     28,934 K
```

**Impact:** Port conflicts, memory usage, confusion about which server is running.

**Solution:**
```bash
# Kill all and restart cleanly
taskkill /f /im node.exe

# Start in order
cd "path/to/project"
npm start          # Terminal 1: Office add-in (port 3000)
npm run start:api  # Terminal 2: API server (port 3001)
npm run start:web  # Terminal 3: Web viewer (port 3002)
```

## Git and File Management Issues

### Symptom: Directory Cannot Be Removed
```powershell
Remove-Item -Path "OpenGov-Contracts-Clean" -Recurse -Force
# Remove-Item : The process cannot access the file because it is being used by another process
```

**Cause:** Node.js processes holding file handles.

**Solution:**
```powershell
# Kill Node processes first
taskkill /f /im node.exe

# Then remove directory
Remove-Item -Path "OpenGov-Contracts-Clean" -Recurse -Force
```

### Symptom: Git Merge Conflicts
```bash
git merge feature/sse-real-time-sync
# CONFLICT (content): Merge conflict in package.json
# CONFLICT (add/add): Merge conflict in api-server.js
```

**Prevention:** Clean up project structure before merging:
1. Move working files to consistent location
2. Remove duplicate/old files
3. Test everything works
4. Then merge

## Performance Debugging

### Memory Monitoring
```bash
# Windows Task Manager
# Look for multiple node.exe processes
# Check memory usage (should be <100MB for dev)

# Process monitoring
tasklist /fi "imagename eq node.exe" /fo table
```

### File Size Monitoring
```javascript
// Add to upload endpoint
const buffer = Buffer.from(req.body.docx, 'base64');
const sizeKB = Math.round(buffer.length / 1024);
console.log(`📄 Upload: ${req.body.filename} (${sizeKB}KB)`);

if (sizeKB > 5000) {
    console.warn('⚠️ Large file:', sizeKB + 'KB');
}
```

### Network Debugging
```javascript
// Add request timing
const startTime = Date.now();
const response = await fetch('/api/upload', requestOptions);
const duration = Date.now() - startTime;
console.log(`Upload took ${duration}ms`);
```

## Emergency Recovery

### Complete Environment Reset
```bash
# 1. Kill all Node processes
taskkill /f /im node.exe

# 2. Clear npm cache
npm cache clean --force

# 3. Remove node_modules (if corrupted)
rm -rf node_modules
npm install

# 4. Restart in order
npm start          # Office add-in
npm run start:api  # API server  
npm run start:web  # Web viewer
```

### Return to Known Good State
```bash
# Find your last working commit
git log --oneline -10

# Reset to known good state
git checkout 9eb9116  # Your "FINAL FOUNDATION" commit

# Restart servers
npm install
npm start
```

## Diagnostic Checklist

When something breaks, check in this order:

1. **Are all servers running?**
   ```bash
   # Should see 3 terminals with active processes
   netstat -ano | findstr ":3000"  # Office add-in
   netstat -ano | findstr ":3001"  # API server
   netstat -ano | findstr ":3002"  # Web viewer
   ```

2. **Can you access endpoints?**
   - `https://localhost:3000` (Office add-in)
   - `http://localhost:3001/api/health` (API health check)
   - `http://localhost:3002/viewer.html` (Web viewer)

3. **Check browser console for errors**
   - Right-click in add-in → Inspect
   - Look for red error messages

4. **Check server logs**
   - Look at terminal outputs
   - Check for error messages or stack traces

5. **Verify file permissions and paths**
   - Check if `uploads/` directory exists
   - Verify script paths in HTML files

---

**Previous:** [API Integration Guide](api-integration.md) | **Next:** [Git Workflow Best Practices](git-workflow.md)
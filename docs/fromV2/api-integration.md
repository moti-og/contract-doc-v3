# API Integration Patterns: Real Implementation Lessons

## Express.js + Office.js Integration

### Document Upload Patterns

#### Initial Broken Approach
```javascript
// ❌ Tried to send File object directly
const fileInput = document.querySelector('input[type="file"]');
const formData = new FormData();
formData.append('document', fileInput.files[0]);

fetch('/api/upload', {
    method: 'POST', 
    body: formData  // Office.js can't handle FormData reliably
});
```

**Error:**
```
TypeError: Failed to construct 'FormData': parameter 1 is not of type 'HTMLFormElement'
```

#### Working Base64 Pattern
```javascript
// ✅ Base64 conversion in Office.js
const base64 = await new Promise((resolve, reject) => {
    Office.context.document.getFileAsync(Office.FileType.Compressed, (result) => {
        if (result.status === Office.AsyncResultStatus.Succeeded) {
            const file = result.value;
            file.getSliceAsync(0, (sliceResult) => {
                resolve(sliceResult.value.data);
                file.closeAsync();
            });
        } else {
            reject(new Error('Failed to get document file'));
        }
    });
});

// Send as JSON
fetch('/api/upload-docx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        docx: base64,
        filename: 'document.docx'
    })
});
```

### Express Server Configuration

#### Request Size Limits
```javascript
// ❌ Default limit too small for documents
app.use(express.json());
// Error: request entity too large

// ✅ Increased for DOCX files
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
```

#### CORS Issues & Solutions
```javascript
// ❌ Simple CORS - didn't work with Office.js
app.use(cors());

// ❌ Overly restrictive
app.use(cors({
    origin: 'https://localhost:3000'
}));
// Error: blocked by CORS policy

// ✅ Multiple origins for development
app.use(cors({
    origin: [
        'https://localhost:3000',  // Office add-in
        'http://localhost:3002',   // Web viewer  
        'https://localhost:3002'   // Web viewer HTTPS
    ],
    credentials: true
}));
```

## SuperDoc API Integration

### Loading Documents
```javascript
// ❌ Direct file path approach
new SuperDoc({
    selector: '#superdoc',
    document: './uploads/document.docx'  // 404 errors
});

// ✅ API endpoint approach  
new SuperDoc({
    selector: '#superdoc',
    document: `http://localhost:3001/api/document/${documentId}`,
    documentMode: 'editing',
    licenseKey: 'agplv3'
});
```

### Export Handling Evolution
```javascript
// ❌ First attempt - assumed simple return
const result = await superdoc.export();
console.log(result); // undefined

// ❌ Second attempt - wrong method name
const result = await superdoc.exportToDOCX();
// Error: exportToDOCX is not a function

// ✅ Correct method with proper handling
const docxResult = await superdoc.exportEditorsToDOCX();
console.log('Type:', typeof docxResult);           // object
console.log('Is Array:', Array.isArray(docxResult)); // true
console.log('Length:', docxResult.length);           // 1
console.log('First element:', docxResult[0]);        // Blob

// Handle the Blob
const blob = docxResult[0];
const arrayBuffer = await blob.arrayBuffer();
const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
```

### Memory Management for Large Files
```javascript
// ❌ Stack overflow with large documents
const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
// RangeError: Maximum call stack size exceeded

// ✅ Chunked conversion
let binaryString = '';
const chunkSize = 8192;
for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.slice(i, i + chunkSize);
    binaryString += String.fromCharCode.apply(null, chunk);
}
const base64 = btoa(binaryString);
```

## API Endpoint Design

### Document Storage Pattern
```javascript
// Storage structure
let currentDocument = {
    id: null,
    filename: null, 
    filePath: null,
    lastUpdated: null
};

// Upload endpoint
app.post('/api/upload-docx', (req, res) => {
    try {
        const { docx, filename } = req.body;
        
        const timestamp = Date.now();
        const fileName = filename || `word-document-${timestamp}.docx`;
        const filePath = path.join('./uploads', fileName);
        
        // Convert base64 to file
        const buffer = Buffer.from(docx, 'base64');
        fs.writeFileSync(filePath, buffer);
        
        // Update current document reference
        currentDocument = {
            id: `doc-${timestamp}`,
            filename: fileName,
            filePath: filePath,
            lastUpdated: new Date().toISOString()
        };
        
        res.json({
            success: true,
            documentId: currentDocument.id,
            filename: fileName
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
```

### Document Serving
```javascript
// Serve to SuperDoc
app.get('/api/document/:documentId', (req, res) => {
    try {
        if (!currentDocument.filePath || !fs.existsSync(currentDocument.filePath)) {
            return res.status(404).json({ error: 'Document not found' });
        }
        
        // Critical headers for SuperDoc
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `inline; filename="${currentDocument.filename}"`);
        
        const fileStream = fs.createReadStream(currentDocument.filePath);
        fileStream.pipe(res);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
```

### Base64 API for Office.js
```javascript
// Return base64 for Word import
app.get('/api/get-updated-docx', (req, res) => {
    try {
        if (!currentDocument.filePath || !fs.existsSync(currentDocument.filePath)) {
            return res.status(404).json({ error: 'No document available' });
        }
        
        const fileBuffer = fs.readFileSync(currentDocument.filePath);
        const base64 = fileBuffer.toString('base64');
        
        res.json({
            docx: base64,
            filename: currentDocument.filename,
            lastUpdated: currentDocument.lastUpdated
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
```

## Error Handling Patterns

### Office.js Error Handling
```javascript
// ❌ Basic try/catch misses Office.js async patterns
try {
    const result = Word.run(async (context) => {
        // Office operations
    });
} catch (error) {
    // This won't catch Office.js errors!
}

// ✅ Proper error handling
async function exportToAPI() {
    try {
        await Word.run(async (context) => {
            // Office operations here
            await context.sync();
        });
        
        // API call here
        const response = await fetch('/api/upload');
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }
    } catch (error) {
        console.error('Export failed:', error);
        showStatus('saveStatus', 'Export failed: ' + error.message, 'error');
    }
}
```

### API Response Validation
```javascript
// ❌ Assuming success
const result = await response.json();
console.log(result.documentId); // Might be undefined

// ✅ Defensive programming
if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Server error ${response.status}: ${errorText}`);
}

const result = await response.json();
if (!result.success || !result.documentId) {
    throw new Error('Invalid response format');
}
```

## Network & Timing Issues

### Race Conditions
```javascript
// ❌ Multiple rapid uploads
function rapidSync() {
    exportToAPI();  // Call 1
    exportToAPI();  // Call 2 - overwrites call 1
}

// ✅ Prevent concurrent operations
let isUploading = false;

async function exportToAPI() {
    if (isUploading) {
        showStatus('saveStatus', 'Upload in progress...', 'info');
        return;
    }
    
    isUploading = true;
    try {
        // Upload logic
    } finally {
        isUploading = false;
    }
}
```

### Timeout Handling
```javascript
// ❌ No timeout - hangs forever
const response = await fetch('/api/upload', {
    method: 'POST',
    body: JSON.stringify(data)
});

// ✅ Request timeout
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000);

try {
    const response = await fetch('/api/upload', {
        method: 'POST',
        body: JSON.stringify(data),
        signal: controller.signal
    });
    clearTimeout(timeoutId);
} catch (error) {
    if (error.name === 'AbortError') {
        throw new Error('Upload timeout - file too large?');
    }
    throw error;
}
```

## Development vs Production

### Environment Configuration
```javascript
// ❌ Hardcoded URLs
const API_BASE = 'http://localhost:3001';

// ✅ Environment-aware
const API_BASE = process.env.NODE_ENV === 'production' 
    ? 'https://api.yourdomain.com'
    : 'http://localhost:3001';
```

### Logging Differences
```javascript
// Development: Verbose logging
console.log('Upload started:', filename);
console.log('File size:', buffer.length);
console.log('Document ID:', documentId);

// Production: Error-only logging
if (error) {
    console.error('Upload failed:', error.message);
}
```

## Performance Optimization

### File Size Monitoring
```javascript
// Monitor upload sizes
app.post('/api/upload-docx', (req, res) => {
    const buffer = Buffer.from(req.body.docx, 'base64');
    const sizeKB = Math.round(buffer.length / 1024);
    
    console.log(`📄 DOCX uploaded: ${req.body.filename} (${sizeKB}KB)`);
    
    if (sizeKB > 10000) { // 10MB warning
        console.warn('⚠️ Large file uploaded:', sizeKB + 'KB');
    }
});
```

### Memory Usage Patterns
```bash
# Before optimization
node    1234  23.4  15.2  1234567  890123

# After chunked processing  
node    1234  12.1   8.7   567890  345678
```

**Key Lesson:** Base64 conversion roughly triples memory usage. A 10MB DOCX becomes ~30MB in memory during processing.

---

**Next:** [Troubleshooting Common Issues](troubleshooting-guide.md)
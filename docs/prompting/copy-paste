Copy-paste rules for commands and code

- Always put commands/code in fenced code blocks, with the correct language tag.
  - Use:
    - ```powershell for Windows/PowerShell
    - ```bash for POSIX shells
    - ```json, ```yaml, ```xml, etc. for data
- Do not include prompts, prefixes, or inline commentary inside the block.
  - Bad: PS C:\> npm install
  - Good:
```powershell
npm install
```
- Keep commands copy-ready: no interactive prompts, add flags like --yes when appropriate.
- Use separate blocks when actions run in different terminals or directories.
  - Label them briefly above the block (e.g., “Terminal A (repo root)”).
- Prefer absolute paths when context is ambiguous; otherwise, set the working directory first with a command at the top of the block.
- Avoid line wrapping; one command per line. If chaining is required, use the correct operator for the shell (PowerShell: ;).
- For clarity, put comments on their own lines inside the block using the shell’s comment syntax.
- For inline references in text, wrap short snippets in single backticks (e.g., `npm start`).
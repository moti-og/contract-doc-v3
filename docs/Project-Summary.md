# Product Brief: Contract Document System

References: [New Prototype repo [Prototype repo](https://github.com/moti-og/Contract-Document-System-V2), [state matrix doc](https://github.com/moti-og/Contract-Document-System-V2/blob/main/DocsByAI/state-matrix/state-matrix-plain-english.md), [lessons learned docs](https://github.com/moti-og/Contract-Document-System-V2/blob/main/DocsByAI/lessons-learned-summary.md)

## 1. Purpose & Vision

- **Problem**: Current contract documents are clones of solicitations—functional but missing contract-specific workflows (e.g., redlining, high-fidelity formatting, Word-native features).
- **Goal**: Deliver an **enterprise-grade contract document system** embedded in Word and Web, with seamless sync, stateful workflows, and collaborative editing. For the prototype, we ship without auth or a database.
- **Vision**: Meet agencies where they are—inside Microsoft Word—while layering in automation, AI, and structured contract workflows.
- **Prototype**: Existing prototype provides the baseline for iteration and validation.

---

## 2. Scope & Target Users

- **Primary users**: Government procurement officers, contract managers, vendors.
- **Scope**:
  - Document authoring & editing (Word Add-in + Web Viewer)
  - Approvals, redlining, and signatures
  - Vendor collaboration & controlled sharing
  - Audit trails and compliance (enterprise identity via Okta in later phases)
  - Packet compile from exhibits (assemble additional files into a contract packet)

---

## 3. Success Measures

**Goal**: Create a seamless document workflow that meets customers in Word but brings the full lifecycle—templating, versioning, collaboration—into the OpenGov platform.

### Success Metrics

- Increase contract document usage per customer by 30% in the 12 months post-launch
- Decrease support tickets related to formatting and versioning by 80%
- 80% of new contract templates are created directly in Word using the new system
- 90% of users conduct document drafting, editing (including redlining), and signing within the system

### Success Criteria

- Complete end-to-end workflow from template → authored document → approval → signed → archived
- No loss in document formatting or content
- Full support for collaborative contract processes like redlining
- Backward compatibility with the existing systems, including setup-question workflows

---

## 4. Principles

- **Parallel Development**: The add-in and the web viewer are built in parallel to guarantee parity and reduce long-term divergence.
- **Shared Logic**: Both consume the same state matrix JSON and rendering logic, minimizing platform-specific code.
- **Adapters Only**: Each platform has lightweight adapters for UI conventions (Office.js vs browser DOM) but business rules and permissions remain centralized.
- **Cross-Platform Testing**: Regression tests ensure actions (e.g., Approve, Finalize, Sign) behave identically across clients.
- **Delivery Cadence**: Features are introduced in tandem to both clients; mismatched releases are avoided to prevent user confusion.

---

## 5. Risks

| Risk Type / Owner   | Risk Detail                                                                              | Risk Level | Mitigation                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| Value / Product     | Word-based workflow may not support our current template automation model                | High       | Redesign template logic to separate metadata capture (questions) from presentation (Word)                   |
| Feasibility / Eng   | Syncing DOCX changes between Word and web may create merge conflicts                     | High       | Implement version control model with check-in/check-out, locks, and visual diffing                          |
| Usability / Design  | Users may be confused about whether they’re in Word or the web editor                    | Medium     | Use consistent UI conventions, integrated naming/version schemes, and onboarding                             |
| Security / IT       | Document sync with M365 may raise compliance and storage concerns                         | Medium     | Rely on Microsoft Graph APIs and secure token-based authentication for OneDrive integration                  |

---

## 6. Release Phases

| Phase            | Key Features                                                                                          | Timing     |
| ---------------- | ------------------------------------------------------------------------------------------------------ | ---------- |
| **Prototype**    | Better version of existing prototype                                                                   | Now        |
| **Private Preview** | Core infra (add-in + web), Okta, bidirectional sync, file management, AI basics.                   | End of Year|
| **MVP**          | Complete redlining, variables, email automation, signatures, vendor experience, lock sections.        | 2026       |
| **Transition**   | Fully independent contract document experience.                                                        | 2026+      |

---

## 7. System Overview

- **Word Add-in**: Primary authoring experience; surfaces actions (submit, approve, finalize) based on server state.
- **Web Viewer**: Alternate editing surface, functionally identical via shared state matrix.
- **Server**:
  - State engine → computes the “state matrix” JSON bundle for UI rendering.
  - Sync hub → manages bidirectional updates between Word and Web via SSE.
  - File management orchestrator → standardizes save/load, handles “View Latest,” supports default document upload/replace with revert-to-canonical, and manages an `exhibits/` collection for packet compile.

### Prototype constraints

- No authentication and no database
- In-memory state with optional JSON file persistence under `data/app` and `data/working`
- Four canonical users for demos with a simple user switcher
- No feature flags — only core demo flows are implemented
- Storage model: one canonical default document; users can upload/replace it or revert to the original; separate `exhibits/` folder for packet assembly
- React loaded via CDN; one shared UI module served by our server and imported by both clients (no bundlers)
- HTTPS dev server at `https://localhost:4001` (trusted local cert); web and add‑in share this origin
- SuperDoc collaboration backend running locally via Docker at `https://localhost:4002`

---

## 8. State Machine Logic

- **Purpose**: Single JSON bundle drives all client UI (Word + Web).
- **Controls**:
  - Button/menu visibility (e.g., Approve, Submit, Finalize)
  - Labels/order of actions
  - Approval banners & viewer messages
  - Checkout status indicators
- **Principles**:
  - Server = single source of truth
  - Event-driven updates (SSE pushes state deltas)
  - Deterministic UI: no client heuristics

---

## 9. Key Features (per Release Phase)

| Feature                 | Prototype | Private Preview | MVP | Transition |
| ----------------------- | :-------: | :-------------: | :-: | :--------: |
| Core infra – Add-in     | No        | Yes             | Yes | Yes        |
| Core infra – Web        | No        | Yes             | Yes | Yes        |
| Okta + User Mgmt        | No        | Yes             | Yes | Yes        |
| Website Integration     | No        | Yes             | Yes | Yes        |
| File Management         | No        | Yes             | Yes | Yes        |
| Basic AI Integration    | No        | Yes             | Yes | Yes        |
| Check-in / Check-out    | Yes       | Yes             | Yes | Yes        |
| Email Automation        | No        | No              | Yes | Yes        |
| Variables               | No        | No              | Yes | Yes        |
| Signatures              | No        | No              | Yes | Yes        |
| Lock Sections           | No        | No              | Yes | Yes        |
| Vendor Experience       | No        | No              | Yes | Yes        |
| Compile                 | Yes       | No              | No  | Yes        |
| Approvals               | Yes       | No              | No  | Yes        |
| Templates               | Yes       | No              | No  | Yes        |

---

## 10. Technical Foundations

The system is built on a layered architecture that enables Word and Web parity, secure enterprise integration, and extensibility.

### Core Infrastructure

- **State Matrix Engine**: A server-computed JSON object that fully determines UI elements, available actions, and state transitions. Eliminates client-side heuristics and ensures deterministic experiences across Word and Web.
- **Sync Hub (SSE)**: Uses Server-Sent Events to push document deltas in real time. Ensures all connected clients (Word add-in, Web viewer) remain in sync and see consistent contract states.
- **Document Locking**: Prevents write conflicts by enforcing single-writer, multi-reader semantics with clear status banners for users.
- **File Management Orchestrator**: Implements layered strategies for opening, saving, and refreshing documents (in-place replace, ms-word protocol, or fallback to external open). Includes finalize/draft toggling and error recovery flows.

### DevOps & Deployment

- **PowerShell Scripts**: Automation for install, per-user setup, task registration, repair, and smoke-testing. Simplifies IT deployment at scale in government agencies.
- **Continuous Testing**: Automated regression tests for save/update flows, ensuring consistent performance across environments.

### Extensibility & Configurability

- **Config-driven UI**: JSON-driven definitions for features like approvals (roles, status pills, colors). Allows rapid iteration without code changes.
- **Cross-platform Shared Modules**: Centralized JavaScript modules apply state matrix logic uniformly to Word add-in and Web viewer, with adapters handling platform differences.
- **AI Integration Hooks**: Early entry points for clause extraction, summarization, and redlining support, expandable as models mature.

### Shared UI Layer (React via CDN)

- **Single source**: React components (Modal, Banner, Dropdown, Finalize dialog, Approvals panel) live in one ES module under `server/public/ui/`.
- **CDN runtime**: Both clients include React/ReactDOM from CDN and import the same module from the server to render identical UI.
- **No build step**: HTML-first clients import ES modules; eliminates bundler divergence and keeps add‑in/Web parity.



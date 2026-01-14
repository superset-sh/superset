# Cloud Workspace Testing Plan

## Overview

This document outlines the testing plan for the Cloud Workspace feature. The feature enables developers to work on remote VMs accessible from any device, with Freestyle.dev as the cloud provider.

---

## Prerequisites

### Environment Setup

1. **Freestyle API Key**
   ```bash
   # Add to .env file at repository root
   FREESTYLE_API_KEY=your_freestyle_api_key
   ```

2. **Database Migration**
   - Ensure migration `0011_add_cloud_workspaces.sql` has been applied
   - Run `bun run db:migrate` if needed

3. **Electric SQL Configuration**
   - Verify cloud_workspaces table is included in Electric SQL shape configuration
   - Confirm sync is working between cloud and local DB

---

## Test Categories

### 1. Database Schema Tests

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Cloud workspace creation | Insert a record into cloud_workspaces table | Record persists with correct field types |
| Foreign key constraints | Create workspace with invalid org/repo ID | Insert fails with foreign key violation |
| Cascade delete | Delete organization with cloud workspaces | All related cloud workspaces deleted |
| Status enum validation | Insert workspace with invalid status | Insert fails with enum constraint |

### 2. Cloud Provider (Freestyle) Integration Tests

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Create VM | Call `freestyle.vms.create()` with valid params | VM created, returns vmId |
| Pause VM | Call `freestyle.vms.suspend()` on running VM | VM state changes to suspended |
| Resume VM | Call `freestyle.vms.start()` on paused VM | VM state changes to running |
| Stop VM | Call `freestyle.vms.stop()` on running VM | VM gracefully stops |
| Delete VM | Call `freestyle.vms.delete()` on stopped VM | VM permanently deleted |
| Get VM status | Call `freestyle.vms.get()` with vmId | Returns current VM status |
| Invalid API key | Make API call with invalid key | Returns authentication error |

### 3. tRPC Router Tests

#### Query Procedures

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| List workspaces | Call `cloudWorkspace.list` with org ID | Returns array of workspaces for org |
| Get single workspace | Call `cloudWorkspace.get` with workspace ID | Returns workspace with relations |
| Get SSH credentials | Call `cloudWorkspace.getSSHCredentials` for running workspace | Returns host, port, username |
| Unauthorized access | Call endpoints without auth token | Returns UNAUTHORIZED error |

#### Mutation Procedures

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Create workspace | Call `cloudWorkspace.create` with valid params | Creates record, triggers provisioning |
| Pause workspace | Call `cloudWorkspace.pause` on running workspace | Updates status to paused |
| Resume workspace | Call `cloudWorkspace.resume` on paused workspace | Updates status to running |
| Stop workspace | Call `cloudWorkspace.stop` on running/paused workspace | Updates status to stopped |
| Delete workspace | Call `cloudWorkspace.delete` on stopped workspace | Removes record, calls Freestyle delete |
| Invalid state transition | Pause a stopped workspace | Returns error, no state change |

### 4. Electric SQL Sync Tests

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Initial sync | Open desktop app after backend creates workspace | Workspace appears in local DB |
| Real-time updates | Change workspace status via API | UI updates within seconds |
| Offline handling | Modify workspace while offline | Changes sync when back online |
| Multiple clients | Open app on two machines | Both see same workspace list |

### 5. Desktop UI Tests

#### Cloud Workspace Modal

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Open modal | Click "+ Cloud" button in sidebar | Modal opens with repository selector |
| Select repository | Choose repo from dropdown | Branch dropdown populates |
| Select branch | Choose branch | Workspace name auto-generates |
| Create workspace | Fill form, click Create | Modal closes, workspace appears in sidebar |
| Validation | Submit with empty fields | Create button stays disabled |
| Error handling | Create with API failure | Toast shows error message |

#### Cloud Workspace List

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Empty state | No cloud workspaces exist | Shows "Create your first cloud workspace" |
| List display | Multiple workspaces exist | All workspaces shown with status badges |
| Status badge colors | Various workspace statuses | Correct color/icon for each status |
| Context menu | Right-click workspace | Shows available actions based on status |

#### Workspace Actions

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Connect | Click Connect on running workspace | Terminal connects to remote |
| Pause | Click Pause in context menu | Status changes to paused, pause action disabled |
| Resume | Click Resume on paused workspace | Status changes to running |
| Stop | Click Stop in context menu | Status changes to stopped |
| Delete | Click Delete on stopped workspace | Workspace removed from list |
| Action availability | Check each status | Only valid actions are enabled |

### 6. Cloud Terminal Tests

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Create session | Connect to running workspace | Terminal session established |
| Command execution | Run `ls -la` in terminal | Output displayed correctly |
| Terminal resize | Resize terminal pane | Remote terminal adjusts |
| Session persistence | Close/reopen terminal | Can reconnect to same session |
| Disconnect handling | Workspace stops while connected | Terminal shows disconnection |

### 7. Session Management Tests

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Join session | Connect to workspace | Session record created |
| Heartbeat | Stay connected for 1+ minutes | lastHeartbeatAt updates |
| Leave session | Disconnect from workspace | Session record removed |
| Auto-stop | Leave workspace idle beyond timeout | Workspace auto-pauses |

---

## Manual Testing Checklist

### Happy Path Flow

- [ ] Create a new cloud workspace from the sidebar
- [ ] Wait for provisioning to complete (status: running)
- [ ] Connect to the workspace terminal
- [ ] Run commands in the terminal
- [ ] Pause the workspace
- [ ] Resume the workspace
- [ ] Stop the workspace
- [ ] Delete the workspace

### Edge Cases

- [ ] Create workspace with long name (50+ chars)
- [ ] Create workspace for branch with special characters
- [ ] Handle Freestyle API rate limits
- [ ] Recover from network interruption during provisioning
- [ ] Handle concurrent operations on same workspace

### Error Scenarios

- [ ] Invalid Freestyle API key
- [ ] Freestyle service unavailable
- [ ] Repository access denied
- [ ] Workspace quota exceeded
- [ ] Network timeout during VM creation

---

## Performance Tests

| Test | Target | Measurement |
|------|--------|-------------|
| VM provisioning time | < 60 seconds | Time from create to running |
| Electric SQL sync latency | < 2 seconds | Time from API change to UI update |
| Terminal responsiveness | < 100ms | Keystroke to display latency |
| List load time | < 500ms | Time to render workspace list |

---

## Security Tests

| Test Case | Verification |
|-----------|--------------|
| Authentication | All endpoints require valid auth token |
| Authorization | Users can only access their org's workspaces |
| API key storage | Freestyle key not exposed in client |
| SSH credentials | Only returned for running workspaces |

---

## Test Environment

### Development
- Local PostgreSQL + Electric SQL
- Freestyle sandbox environment
- Mock SSH connections

### Staging
- Neon branch database
- Freestyle production API (with test projects)
- Real SSH connections

### Production
- Neon main database
- Freestyle production API
- Full monitoring enabled

---

## Known Limitations (V1)

1. **Terminal Output** - Currently polling-based (Freestyle SDK limitation). Full WebSocket support pending SDK update.

2. **Git Sync** - Polling-based sync from GitHub. Real-time webhooks deferred to V2.

3. **Provider Support** - Only Freestyle.dev supported. Fly.io deferred to V2.

---

## Test Data Cleanup

After testing:
```sql
-- Clean up test cloud workspaces
DELETE FROM cloud_workspaces WHERE name LIKE 'test-%';

-- Or use Freestyle dashboard to delete test VMs
```

---

## Reporting

Test results should be documented in:
1. GitHub Issue for tracking
2. Team Slack channel for visibility
3. Post-implementation review meeting
